import { Component, type ReactNode } from "react";

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a19",
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
          padding: "24px",
        }}>
          <div style={{
            maxWidth: 560,
            padding: 32,
            borderRadius: 16,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}>
            <h1 style={{ fontSize: 20, marginBottom: 12 }}>Something crashed</h1>
            <p style={{ color: "#9ca3af", fontSize: 14, marginBottom: 16 }}>
              {this.state.error.message}
            </p>
            <pre style={{
              fontSize: 11,
              background: "rgba(0,0,0,0.4)",
              padding: 12,
              borderRadius: 8,
              overflow: "auto",
              maxHeight: 240,
              color: "#d1d5db",
            }}>
              {this.state.error.stack}
            </pre>
            <button
              onClick={() => { this.setState({ error: null }); location.reload(); }}
              style={{
                marginTop: 16,
                padding: "8px 16px",
                borderRadius: 8,
                background: "#6366f1",
                color: "#fff",
                border: "none",
                cursor: "pointer",
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
