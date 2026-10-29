export type FolioMode =
  | "wall"
  | "shelf"
  | "slate"
  | "day"
  | "month"
  | "instrument"
  | "reflect"
  | "form";

export type LedgerFocus = "auto" | "library";

export const LEDGER_COLLAPSE_KEY = "inkboard.folio.ledgerCollapsed";
export const LEDGER_EVENT = "inkboard:toggle-ledger";
export const LEDGER_FOCUS_EVENT = "inkboard:ledger-focus";
export const ATELIER_MQ = "(min-width: 1080px)";

export function folioMode(pathname: string): FolioMode {
  if (pathname.startsWith("/play/") || pathname.startsWith("/live/") || pathname === "/offline" || pathname.startsWith("/offline/")) return "slate";
  if (pathname.startsWith("/planner/today")) return "day";
  if (
    pathname.startsWith("/planner/dashboard") ||
    pathname.startsWith("/planner/analytics") ||
    pathname.startsWith("/planner/ink") ||
    pathname.startsWith("/planner/guide") ||
    pathname.startsWith("/planner/history")
  ) {
    return "instrument";
  }
  if (pathname.startsWith("/planner/badges")) return "reflect";
  if (
    pathname.startsWith("/planner/new") ||
    pathname.startsWith("/planner/settings") ||
    pathname.startsWith("/planner/kit")
  ) {
    return "form";
  }
  if (pathname === "/planner" || pathname.startsWith("/planner/")) return "month";
  if (
    pathname.startsWith("/course/") ||
    pathname.startsWith("/teacher/") ||
    pathname.startsWith("/batch/") ||
    pathname.startsWith("/search")
  ) {
    return "shelf";
  }
  return "wall";
}

export function isPlannerMode(mode: FolioMode) {
  return mode === "day" || mode === "month" || mode === "instrument" || mode === "reflect" || mode === "form";
}

/** Room for the eraser-wipe key: planner sub-tabs share a room; wall vs exam do not. */
export function boardRoom(pathname: string): string {
  const mode = folioMode(pathname);
  if (mode === "wall") return pathname === "/" ? "home" : "exam";
  return mode;
}

export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export const FOLIO_BOOTSTRAP = `(function(){try{if(localStorage.getItem("${LEDGER_COLLAPSE_KEY}")==="1")document.documentElement.setAttribute("data-ledger-folded","1");}catch(e){}})();`;


export function formatRemain(mins: number) {
  const n = Math.max(0, Math.round(mins));
  if (n < 60) return `${n}m`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function folioDate(d = new Date()) {
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

/** Folio number for the desk: weekday as a seal, day + month as the line. */
export function folioDateParts(d = new Date()) {
  return {
    weekday: d.toLocaleDateString("en-GB", { weekday: "long" }).toUpperCase(),
    dayMonth: d.toLocaleDateString("en-GB", { day: "numeric", month: "long" }),
  };
}

export function peekCopy(pending: number, minutes: number, hasPlan: boolean, seal = "") {
  void minutes;
  if (hasPlan && pending > 0) return `${pending} left · pull`;
  if (seal) return `${seal} · pull`;
  if (hasPlan) return "Board clear · pull";
  return "Blank · pull";
}

export function toggleLedger() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(LEDGER_EVENT));
}

export function focusLedger(focus: LedgerFocus = "library") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LEDGER_FOCUS_EVENT, { detail: focus }));
}
