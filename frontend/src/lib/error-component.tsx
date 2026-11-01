import type { ErrorComponentProps } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";
import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { COPY } from "@inkboard/shared/copy";

const FALLBACK_MESSAGE = "Something went wrong. Try again.";
const PATH_LEAK = /(?:\/[\w.-]+){2,}|[A-Za-z]:\\|node_modules|\bat [\w$.<>]+\s+\(/;

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return FALLBACK_MESSAGE;
}

function errorStack(error: unknown): string {
  if (error instanceof Error && error.stack) return error.stack;
  return "";
}

export function devMode(): boolean {
  try {
    return import.meta.env.DEV === true;
  } catch {
    return false;
  }
}

export function errorIdFor(error: unknown): string {
  if (error && typeof error === "object" && "requestId" in error) {
    const id = (error as { requestId?: unknown }).requestId;
    if (typeof id === "string" && id && !id.includes("/") && id.length < 80) return id;
  }
  const msg = error instanceof Error ? error.message : "error";
  let hash = 0;
  for (let i = 0; i < msg.length; i += 1) hash = (hash * 33 + msg.charCodeAt(i)) >>> 0;
  return `e${hash.toString(16)}`;
}

export function publicMessage(error: unknown, dev: boolean): string {
  const raw = errorMessage(error);
  if (dev) return raw;
  if (PATH_LEAK.test(raw) || raw.split("\n").length > 3) return FALLBACK_MESSAGE;
  return raw;
}

export function errorView(error: unknown, componentStack: string, dev: boolean) {
  const message = publicMessage(error, dev);
  const stack = dev ? [errorStack(error), componentStack].filter(Boolean).join("\n\n") : "";
  const id = errorIdFor(error);
  const blob = dev ? [message, errorStack(error), componentStack].filter(Boolean).join("\n\n") : `${message}\n${id}`;
  return { message, stack, id, blob };
}

function copyText(text: string) {
  try {
    void navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
}

export function ErrorSheet({
  title,
  message,
  stack,
  blob,
  primaryLabel,
  onPrimary,
  errorId,
  level = 1,
}: {
  title: string;
  message: string;
  stack: string;
  blob: string;
  primaryLabel: string;
  onPrimary: () => void;
  errorId: string;
  level?: 1 | 2;
}) {
  const Title = level === 1 ? "h1" : "h2";
  return (
    <div className="board-pad measure py-12 fade-in" data-error-boundary="true">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-danger/10" aria-hidden="true">
        <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-danger">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <p className="text-xs font-semibold tracking-[0.14em] uppercase text-fg-faint">Error</p>
      <Title className="mt-2 text-display">{title}</Title>
      <p className="mt-3 text-sm text-fg-muted">{message}</p>
      <p className="mt-2 text-xs text-fg-faint">Error id {errorId}</p>
      {stack ? (
        <pre className="mt-4 max-h-48 overflow-auto border-y border-line py-3 text-xs text-fg-muted whitespace-pre-wrap">
          {stack}
        </pre>
      ) : null}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button type="button" onClick={onPrimary}>
          {primaryLabel}
        </Button>
        <a href="/" className="inline-flex h-11 items-center text-sm text-fg-muted hover:text-fg">
          {COPY.backToTheWall}
        </a>
        <button type="button" className="h-11 text-sm text-fg-muted hover:text-fg" onClick={() => copyText(blob)}>
          Copy details
        </button>
      </div>
    </div>
  );
}

export function AppErrorComponent({ error, info }: ErrorComponentProps) {
  const router = useRouter();
  const view = errorView(error, info?.componentStack ?? "", devMode());
  return (
    <ErrorSheet
      title={COPY.boardDidNotHold}
      message={view.message}
      stack={view.stack}
      blob={view.blob}
      errorId={view.id}
      primaryLabel={COPY.tryAgain}
      onPrimary={() => {
        void router.invalidate();
      }}
    />
  );
}

type BoundaryProps = { children: ReactNode; title?: string };
type BoundaryState = { error: Error | null; componentStack: string };

export class WidgetErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null, componentStack: "" };

  static getDerivedStateFromError(error: Error): Pick<BoundaryState, "error"> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    this.setState({ error, componentStack: info.componentStack ?? "" });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const view = errorView(this.state.error, this.state.componentStack, devMode());
    return (
      <div className="ui-card" role="alert" data-error-boundary="widget">
        <p className="text-xs font-semibold tracking-[0.14em] uppercase text-fg-faint">Error</p>
        <h2 className="mt-2 font-serif text-xl">{this.props.title ?? COPY.slateSlipped}</h2>
        <p className="mt-2 text-sm text-fg-muted">{view.message}</p>
        <p className="mt-2 text-xs text-fg-faint">Error id {view.id}</p>
        {view.stack ? (
          <pre className="mt-3 max-h-40 overflow-auto text-xs text-fg-muted whitespace-pre-wrap">{view.stack}</pre>
        ) : null}
        <div className="mt-4">
          <Button type="button" onClick={() => this.setState({ error: null, componentStack: "" })}>
            {COPY.tryAgain}
          </Button>
        </div>
      </div>
    );
  }
}

export class PlayerErrorBoundary extends WidgetErrorBoundary {}
