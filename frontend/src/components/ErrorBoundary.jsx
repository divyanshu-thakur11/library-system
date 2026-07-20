import { Component } from 'react';

// Wraps the app so a crash in any page shows the actual error instead of a
// blank screen - makes it possible to diagnose issues without needing
// browser dev tools open. Not a substitute for fixing the underlying bug,
// just makes bugs visible and reportable.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    console.error('App crashed:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, maxWidth: 800, margin: '0 auto', fontFamily: 'monospace' }}>
          <h1 style={{ color: '#a3402f', fontFamily: 'sans-serif' }}>Something went wrong</h1>
          <p style={{ fontFamily: 'sans-serif' }}>
            Please take a screenshot of the box below and share it so this can be fixed.
          </p>
          <div style={{ background: '#f6dede', border: '1px solid #a3402f', borderRadius: 6, padding: 16, whiteSpace: 'pre-wrap', fontSize: '0.85rem', overflowX: 'auto' }}>
            {this.state.error.toString()}
            {this.state.info?.componentStack}
          </div>
          <button
            style={{ marginTop: 16, padding: '8px 16px', fontFamily: 'sans-serif', cursor: 'pointer' }}
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
