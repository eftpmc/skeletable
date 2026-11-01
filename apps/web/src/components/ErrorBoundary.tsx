import { Component, type ReactNode } from "react";

/** If a page breaks, show a way out instead of a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.error(error);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="font-medium">Something went wrong on this page</p>
        <a href="/" className="text-sm text-muted-foreground underline">Go back to Skeletable</a>
      </div>
    );
  }
}
