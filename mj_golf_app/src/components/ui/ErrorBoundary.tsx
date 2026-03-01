import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-surface px-6">
          <div className="flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card px-8 py-12 text-center shadow-sm">
            <div className="text-4xl text-coral">!</div>
            <h1 className="text-xl font-semibold text-text-dark">
              Something went wrong
            </h1>
            <p className="text-sm text-text-muted">
              An unexpected error occurred. Try reloading the page.
            </p>
            {import.meta.env.DEV && this.state.error && (
              <pre className="mt-2 max-h-40 w-full overflow-auto rounded-lg border border-border bg-surface p-3 text-left text-xs text-coral">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              className="mt-2 inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-light active:bg-primary"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
