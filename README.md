# Shiv Shakti Library — Self-Study Library / Cabin Management System

A production-ready, cloud-deployable cabin & member management system for a
self-study library, built as two independent apps that talk over a JSON API.

```
library-system/
├── start.bat        Double-click to run everything on Windows
├── start.command     Double-click to run everything on macOS
├── start.sh          Run from a terminal on Linux
├── backend/          Node.js + Express API, PostgreSQL via Knex migrations
└── frontend/         React (Vite) admin dashboard
```

## Running it (no command prompt needed)

1. Create a PostgreSQL database (locally or a free-tier cloud one) and copy
   `backend/.env.example` to `backend/.env`, filling in `DATABASE_URL` and
   the two `JWT_*_SECRET` values (any long random string works).
2. **Windows:** double-click `start.bat`.
   **macOS:** double-click `start.command` (first time only: right-click →
   Open, to get past Gatekeeper's "unidentified developer" warning).
   **Linux:** run `./start.sh` from a terminal.
3. The script installs dependencies (first run only), runs database
   migrations, starts both servers, and opens `http://localhost:5173` in
   your browser automatically. Leave the window open while you use the app.

The very first time, also run once (from the same folder):
```
npm run seed --prefix backend
```
which creates the first Owner login (reads `FIRST_ADMIN_EMAIL` /
`FIRST_ADMIN_PASSWORD` from the environment, or falls back to
`admin@library.local` / `ChangeMe123!` — **change this password immediately
from Settings after logging in**) and the initial 91 cabins.

## Roles: Owner and Manager

- **Owner** (stored internally as the `admin` role) has a separate login
  page at `/login/owner` — this is the account you use.
- **Manager** accounts are created *by* the Owner from **Settings → Owner &
  Manager Accounts**, where you set their username (email) and password.
  Managers sign in at a different page, `/login/manager`. Each login page
  rejects the wrong account type with a clear message, so a manager can't
  end up on the owner dashboard by mistake.
- From **Settings**, the Owner can also reset any Manager's password (or
  their own) without needing the old one, and both roles can change their
  own password with their current password.

## What each tab does

| Tab | Purpose |
|---|---|
| Dashboard | Collections, active members, occupancy, special cases, expired count |
| Members | Member register — add/search/edit |
| Members | Member register — add (prefilled ID `SA-YY-YY-#`, editable year), search, **edit**, **vacate** (frees their cabin time ranges without deleting them), **delete** (Owner-only; blocked with a clear message if they have bills on record, so financial history is never silently lost) |
| Cabins | Cabin assignment — enter the member's desired hours/day, pick 1 or 2 time ranges within library hours that add up to that total (Special Case override still available). **True overlap detection**: a second normal booking is blocked if it overlaps an existing one AT ALL, not just if it's the identical time range. Board is grouped into **Morning/Evening** sections and each member gets a consistent color across the whole cabin. Includes **Manage Cabins**: add the next cabin number in one click, or remove a cabin (only if it's never been assigned; otherwise deactivate it instead) |
| Fee Structures | Its own tab now — the Owner can add, edit, and activate/deactivate package pricing (Monthly, 2-Month, etc. × hours/day) at any time |
| Occupancy Calendar | Pick any date and see which cabin/slot was occupied vs free that day, same Morning/Evening grouping and per-member coloring |
| Billing | Generate a bill — pick a Fee Structure to auto-fill the amount, or enter one manually. Both Owner and Manager can create bills. **Owner can void a mis-entered pending bill** (blocked once any payment exists, to protect financial history). |
| Receipts | **Only the Owner can approve a bill and turn it into a receipt** (create a payment record). The Manager can view every receipt and send it to the member via WhatsApp, but cannot create one. Supports **part payments** (multiple receipts per bill; the app blocks paying more than the remaining due). |
| Dues & Part Payments | Outstanding balances, Overdue Members, and Expiring Soon, each with its own from/to date filter |
| Member Cards | Pick a member, auto-fetches their registration no., cabin no., name, father's name, address, mobile no. and a table of registration date / validity / time slots into a printable card, with a Send via WhatsApp button |
| Reports | Collections total, expired memberships, and **Best Available Cabins** — ranked by free hours remaining today, to help pick where to seat a new member |
| Audit Logs | Owner-only — every create/update with before/after state |
| Settings | Password changes, Manager accounts, default operating hours, and a one-click backup export |

## Bug fixes (this update)

1. **WhatsApp links now include the country code** - `wa.me` links need the full international number; previously they used the bare 10-digit number, which usually didn't resolve.
2. **Database conflict errors now say what actually conflicted** - a duplicate email, duplicate cabin number, etc. each get their own accurate message instead of all being reported as a cabin-time overlap.
3. **Sessions no longer silently break after 15 minutes** - the frontend now transparently attempts a token refresh and retries once before giving up and returning you to the login screen.
4. **Deleting a member can no longer silently erase their cabin-assignment history** - blocked (same as the existing bills protection) with a message pointing at Deactivate instead.
5. **Fixed a race condition in "+ Add Cabin"** - the next cabin number is now computed atomically on the server (Postgres advisory lock) instead of guessed in the browser.

Also added: server-side validation that a time range falls within library operating hours (previously browser-only), phone number normalization that correctly extracts the last 10 digits from a pasted `+91 ...` number instead of truncating from the front, and the ability to void a mis-entered pending bill.

## True overlap detection (this update)

Earlier, the system only blocked a second *identical* time-slot row from
being double-booked. Now it blocks ANY overlapping time range in the same
cabin (e.g. a 7am-10pm booking correctly blocks a competing 9-11am booking,
not just an exact 7am-10pm duplicate) - unless Special Case is checked.

This is enforced twice:
1. **Application logic** - a friendly, specific error naming the exact
   conflicting time range.
2. **Database-level** - a Postgres `EXCLUDE` constraint
   (`cabin_assignments_no_overlap`, migration `20260101000012`) using a
   custom `timerange` range type + `btree_gist`. This was tested directly
   against a live Postgres instance, including trying to insert a
   conflicting row with raw SQL (bypassing the API entirely) - it was
   rejected by the database itself.

## Member ID format

New members get `SA-YY-YY-<number>` prefilled (e.g. `SA-26-27-08`), where
the year defaults to the current academic year but can be clicked to
change. Only the number needs typing.

## Cabin & assignment permissions

Assigning a cabin (creating/reusing a time range) is open to both Owner and
Manager, matching day-to-day desk work. Adding or removing a cabin itself,
editing Fee Structures, and approving bills into receipts are Owner-only.

## Why this architecture

- **Stateless backend, JWT in HttpOnly cookies** — no server-side session
  store, so the API can scale horizontally behind a load balancer with zero
  sticky-session requirements.
- **Every tenant/role fact comes from the JWT, never the client** — routes
  trust `req.user.role` (set by `authenticate` middleware from the verified
  token), not any role/org field a client could send in a request body.
- **Migrations, not manual schema edits** — every table change is a
  versioned file under `backend/src/migrations`, run with `npm run migrate`.
  Nothing is ever hand-edited on a live database.
- **Config via environment variables only** — see `.env.example` in both
  `backend/` and `frontend/`. No secrets, no hostnames, no ports are
  hardcoded in code.
- **No local file dependency for critical data** — everything lives in
  Postgres; the only local state is the (stateless) running process.
- **Designed for multi-branch / multi-tenant growth** — cabins, members,
  bills etc. are already scoped by foreign keys rather than globals, so
  adding an `organization_id` or `branch_id` column later is additive, not
  a rewrite.

This response deliberately does **not** include Docker files or hosting
instructions, per the brief — the app is just structured so that deploying
it later (Render, Railway, Fly, a VPS, etc.) is a matter of setting env vars
and running `npm run migrate && npm start`.

## The Special Case Assignment feature (spec section 5)

This is the trickiest rule in the system, so it's enforced in **two
independent places** so it can never silently break:

1. **Application logic** (`assignmentController.js`) — before inserting a
   normal (non-special) assignment, it checks whether the cabin+slot is
   already taken and returns a clear error pointing at the Special Case
   checkbox.
2. **Database constraint** (`cabin_assignments_normal_unique`, a *partial*
   unique index in migration `20260101000005`) — guarantees at the SQL
   level that two non-special assignments can never coexist for the same
   cabin+slot, even under a race condition or a future code bug. Special
   case rows are explicitly exempted from this index, so they can stack
   freely without ever touching or removing the existing assignment.

The Cabin View page renders every member in a slot and tags special-case
ones with a "Special Case" badge, exactly as described in the spec.

## Troubleshooting: "SASL ... client password must be a string"

This means `DATABASE_URL` didn't parse correctly - almost always because
the password has a special character that needs percent-encoding (since
the connection string is a URL):

| Character | Encode as |
|---|---|
| `@` | `%40` |
| `:` | `%3A` |
| `/` | `%2F` |
| `#` | `%23` |
| `%` | `%25` |
| `?` | `%3F` |
| `&` | `%26` |

Or skip encoding entirely by setting discrete fields instead of
`DATABASE_URL` in `backend/.env`:
```
PGHOST=localhost
PGPORT=5432
PGUSER=your_user
PGPASSWORD=your_actual_password
PGDATABASE=library_system
```
The backend now also fails fast at startup with a clear message if
`DATABASE_URL` looks malformed, instead of surfacing a confusing error
later when someone tries to log in.

## Manual setup (if you'd rather not use the launcher)

### 1. Database
Create a PostgreSQL database and note its connection string.

### 2. Backend
```bash
cd backend
cp .env.example .env      # fill in DATABASE_URL, JWT secrets, etc.
npm install
npm run migrate           # creates all tables
FIRST_ADMIN_EMAIL=you@library.local FIRST_ADMIN_PASSWORD=... npm run seed
npm run dev                # http://localhost:5000
```

### 3. Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev                # http://localhost:5173
```

## Project structure reference

**Backend** (`backend/src/`)
- `migrations/` — one file per table/change, run in order by Knex
- `seeds/` — first-owner bootstrap + initial 91 cabins with Morning/Evening slots
- `middleware/auth.js` — JWT verification & `requireRole()` guard
- `middleware/audit.js` — `logAudit()` helper called from every write action
- `controllers/` — one per resource (members, cabins, assignments, billing, receipts, reports, audit, users, auth, feeStructures, settings, backup)
- `routes/` — thin Express routers wiring URLs to controllers + role checks

**Frontend** (`frontend/src/`)
- `context/AuthContext.jsx` — session state, backed by the `/api/auth/me` cookie check, portal-aware login
- `components/ProtectedRoute.jsx` — route guard + role gate (used for the Audit Logs page)
- `pages/` — one page per sidebar item

