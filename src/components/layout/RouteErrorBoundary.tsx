import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; routeName: string };
type State = { error: Error | null };

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[v0] Route rendering failed", {
      route: this.props.routeName,
      message: error.message,
      componentStack: errorInfo.componentStack,
    });
  }

  render() {
    if (this.state.error) {
      return (
        <main className="routeErrorState" role="alert">
          <p className="eyebrow">{this.props.routeName}</p>
          <h1>We couldn&apos;t open this view</h1>
          <p>{this.state.error.message || "An unexpected error interrupted the page."}</p>
          <p className="routeErrorRecovery">Try returning to the library, then retry the action or re-import the affected file.</p>
          <button type="button" onClick={() => this.setState({ error: null })}>Retry</button>
        </main>
      );
    }
    return this.props.children;
  }
}
