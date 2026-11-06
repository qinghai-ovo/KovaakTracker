import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryState {
  error: Error | null;
}

/** Keeps one broken screen from blanking the whole app; shows the error and a reload button. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Screen crashed", error, info.componentStack);
  }

  componentDidUpdate(previous: { resetKey?: string }) {
    // Navigating to another screen clears the error.
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="card" role="alert" style={{ maxWidth: 560 }}>
        <h2 className="card__title">这个页面出错了</h2>
        <span className="small muted" style={{ fontFamily: "var(--font-mono)", wordBreak: "break-word" }}>
          {this.state.error.message}
        </span>
        <button type="button" className="btn-primary" style={{ alignSelf: "flex-start" }} onClick={() => window.location.reload()}>
          重新加载
        </button>
      </section>
    );
  }
}
