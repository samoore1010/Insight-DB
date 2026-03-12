import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, fontFamily: "monospace", background: "#1e293b", color: "#f1f5f9", minHeight: "100vh" }}>
          <h1 style={{ color: "#f87171", marginBottom: 16 }}>Something went wrong</h1>
          <pre style={{ background: "#0f172a", padding: 16, borderRadius: 8, overflow: "auto", fontSize: 13, lineHeight: 1.6 }}>
            {this.state.error?.toString()}
            {"\n\n"}
            {this.state.errorInfo?.componentStack}
          </pre>
          <button
            onClick={() => {
              sessionStorage.removeItem("authUser");
              window.location.reload();
            }}
            style={{ marginTop: 16, padding: "8px 20px", background: "#10b981", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold" }}
          >
            Clear Session & Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
