import { Component, type ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-6 m-4 rounded-lg bg-red-900/20 border border-red-500/50 text-sm">
          <h3 className="font-bold text-red-400 mb-2">Something went wrong</h3>
          <pre className="text-red-300 text-xs whitespace-pre-wrap overflow-auto max-h-96">
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-3 px-3 py-1 rounded text-xs bg-red-500/20 border border-red-500/50 text-red-300 hover:bg-red-500/30"
          >
            Dismiss
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
