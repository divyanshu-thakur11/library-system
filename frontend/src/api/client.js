const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// Access tokens expire in 15 minutes. Rather than let every request that
// happens to land after that show a confusing 401, we transparently try
// ONE refresh (via the httpOnly refresh_token cookie) and retry the
// original request. If the refresh itself fails, the session is genuinely
// over - we broadcast that so AuthContext can clear the user, which sends
// them back to the login screen through the existing route guard.
let refreshInFlight = null;

function requestRefresh() {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${BASE_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function request(path, { method = 'GET', body, params } = {}, isRetry = false) {
  let url = `${BASE_URL}${path}`;
  if (params) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''))
    ).toString();
    if (qs) url += `?${qs}`;
  }

  const res = await fetch(url, {
    method,
    credentials: 'include', // send HttpOnly cookies
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Don't try to refresh around the auth endpoints themselves, or we'd loop.
  const isAuthEndpoint = path.startsWith('/auth/');
  if (res.status === 401 && !isRetry && !isAuthEndpoint) {
    const refreshed = await requestRefresh();
    if (refreshed) {
      return request(path, { method, body, params }, true);
    }
    window.dispatchEvent(new Event('auth:session-expired'));
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    const message = data?.detail ? `${data?.error || 'Request failed'} (${data.detail})` : data?.error || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

export const api = {
  get: (path, params) => request(path, { params }),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
};
