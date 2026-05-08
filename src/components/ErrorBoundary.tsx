'use client';

import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level React error boundary. Wraps the app shell so a render-time
 * crash inside any panel doesn't take down the whole UI. Shows a
 * "something broke" card with the stack and a Reset button. Errors are
 * also logged to the console (and to /api/log if a Sentry/DSN is
 * configured later — left as an env-driven hookup).
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);
    // Best-effort report — fire-and-forget. /api/log accepts a JSON body
    // and can be wired to Sentry server-side.
    try {
      fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: 'error',
          source: 'react-error-boundary',
          message: error.message,
          stack: error.stack,
          componentStack: info.componentStack,
          ts: new Date().toISOString(),
        }),
      }).catch(() => {});
    } catch {
      // ignore
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="card max-w-2xl w-full">
            <div className="card-header">
              <h2 className="text-lg font-bold text-loss">Something broke</h2>
              <p className="text-xs text-gray-500 mt-1">
                A render error was caught by the top-level boundary. Your data
                in localStorage is unaffected. Click Reset to retry.
              </p>
            </div>
            <div className="card-body space-y-3">
              <pre className="text-[11px] font-mono text-loss whitespace-pre-wrap p-3 bg-loss/5 border border-loss/30 rounded max-h-60 overflow-auto">
                {this.state.error.message}
                {this.state.error.stack && '\n\n' + this.state.error.stack}
              </pre>
              <div className="flex gap-2">
                <button
                  className="btn-primary"
                  onClick={this.reset}
                >
                  Reset
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => window.location.reload()}
                >
                  Hard reload
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
