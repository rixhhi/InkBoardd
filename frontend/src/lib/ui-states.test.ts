import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import axe from "axe-core";
import { JSDOM } from "jsdom";

function src(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

async function axeHtml(html: string) {
  const dom = new JSDOM(`<!doctype html><html lang="en"><head><title>Inkboard</title></head><body>${html}</body></html>`);
  const results = await axe.run(dom.window.document.documentElement, {
    runOnly: {
      type: "rule",
      values: ["document-title", "html-has-lang", "button-name", "link-name", "landmark-one-main", "region", "heading-order"],
    },
  });
  assert.deepEqual(
    results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id),
    [],
  );
}

describe("production error sheet", () => {
  it("drops stacks and internal paths when not in dev", async () => {
    const { errorView } = await import("./error-component.tsx");
    const view = errorView(new Error("explode\n    at boom (/var/tmp/ink.ts:1:1)"), "\n    at Child (/workspace/frontend/src/x.tsx:2:1)", false);
    assert.equal(view.stack, "");
    assert.equal(view.message, "Something went wrong. Try again.");
    assert.doesNotMatch(view.blob, /\/var\/tmp|\/workspace|at Child/);
    assert.match(view.id, /^e[0-9a-f]+$/);
    const dev = errorView(new Error("plain miss"), "at Child", true);
    assert.match(dev.stack, /at Child/);
  });

  it("renders a widget fallback and recovers on retry", async () => {
    const dom = new JSDOM(`<!doctype html><html lang="en"><body><div id="root"></div></body></html>`, {
      url: "http://127.0.0.1/",
      pretendToBeVisual: true,
    });
    const g = globalThis as typeof globalThis & {
      window: Window;
      document: Document;
      HTMLElement: typeof HTMLElement;
      Element: typeof Element;
      Node: typeof Node;
      SVGElement: typeof SVGElement;
      MutationObserver: typeof MutationObserver;
      getComputedStyle: typeof getComputedStyle;
      IS_REACT_ACT_ENVIRONMENT: boolean;
      requestAnimationFrame: (cb: FrameRequestCallback) => number;
    };
    g.window = dom.window;
    g.document = dom.window.document;
    g.HTMLElement = dom.window.HTMLElement;
    g.Element = dom.window.Element;
    g.Node = dom.window.Node;
    g.SVGElement = dom.window.SVGElement;
    g.MutationObserver = dom.window.MutationObserver;
    g.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
    g.IS_REACT_ACT_ENVIRONMENT = true;
    g.requestAnimationFrame = (cb) => setTimeout(() => cb(0), 0) as unknown as number;

    const React = await import("react");
    const { createRoot } = await import("react-dom/client");
    const { WidgetErrorBoundary, PlayerErrorBoundary, ErrorSheet } = await import("./error-component.tsx");
    const { createElement, act } = React;
    const orig = console.error;
    console.error = () => {};
    let crash = true;
    function Child() {
      if (crash) throw new Error("explode /var/tmp/ink.ts");
      return createElement("p", null, "recovered");
    }
    const host = dom.window.document.getElementById("root");
    assert.ok(host);
    const root = createRoot(host);
    try {
      await act(async () => {
        root.render(createElement(WidgetErrorBoundary, { title: "Something went wrong", children: createElement(Child) }));
      });
      assert.match(dom.window.document.body.textContent ?? "", /Something went wrong/);
      assert.match(dom.window.document.body.textContent ?? "", /Try again/);
      assert.doesNotMatch(dom.window.document.body.textContent ?? "", /\/var\/tmp/);
      assert.equal(dom.window.document.querySelector("pre"), null);
      crash = false;
      const retry = [...dom.window.document.querySelectorAll("button")].find((b) => b.textContent?.includes("Try again"));
      assert.ok(retry);
      await act(async () => {
        retry.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      });
      assert.match(dom.window.document.body.textContent ?? "", /recovered/);

      crash = true;
      await act(async () => {
        root.render(createElement(PlayerErrorBoundary, { title: "Player slipped", children: createElement(Child) }));
      });
      assert.match(dom.window.document.body.textContent ?? "", /Player slipped/);
      assert.equal(dom.window.document.querySelector("pre"), null);
      crash = false;
      const again = [...dom.window.document.querySelectorAll("button")].find((b) => b.textContent?.includes("Try again"));
      await act(async () => {
        again?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      });
      assert.match(dom.window.document.body.textContent ?? "", /recovered/);

      const { errorView } = await import("./error-component.tsx");
      const sheet = errorView(new Error("nope /workspace/a/b.ts"), "at X (/workspace/a/c.tsx:1:1)", false);
      await act(async () => {
        root.render(
          createElement(ErrorSheet, {
            title: "Couldn’t keep this board",
            message: sheet.message,
            stack: sheet.stack,
            blob: sheet.blob,
            primaryLabel: "Try again",
            onPrimary: () => {},
            errorId: sheet.id,
            level: 1 as const,
          }),
        );
      });
      assert.equal(dom.window.document.querySelector("pre"), null);
      assert.doesNotMatch(dom.window.document.body.textContent ?? "", /\/workspace/);
      assert.match(dom.window.document.body.textContent ?? "", /Error id/);
    } finally {
      console.error = orig;
      root.unmount();
    }
  });
});

describe("page state landmarks", () => {
  it("axe accepts loading, empty, and error shells", async () => {
    await axeHtml(`<a href="#main">Skip to content</a><header><nav aria-label="Navigation"><a href="/" aria-current="page">Home</a></nav></header><main id="main"><h1 class="sr-only">Loading</h1><div role="status">Fetching this class</div><div class="skeleton" aria-hidden="true"></div></main>`);
    await axeHtml(`<a href="#main">Skip to content</a><main id="main"><h1>Nothing here yet.</h1><p>Save a class and it will show up here.</p><a href="/search">Search classes and teachers</a></main>`);
    await axeHtml(`<a href="#main">Skip to content</a><main id="main"><h1>Couldn’t open this class</h1><p>Something went wrong. Try again.</p><p>Error id e1</p><button type="button">Try again</button><a href="/">All exams</a></main>`);
  });

  it("player, live, planner, and search expose one title and a boundary", () => {
    const player = src("../components/class-player.tsx");
    const live = src("../components/live-stage.tsx");
    const planner = src("../components/planner/planner-shell.tsx");
    const search = src("../pages/search-page.tsx");
    const play = src("../pages/play-page.tsx");
    const livePage = src("../pages/live-page.tsx");
    assert.match(player, /<main id="main"/);
    assert.match(player, /<h1 className="[^"]*">\{title\}<\/h1>/);
    assert.match(player, /COPY.buffering/);
    assert.match(player, /DeskSkip/);
    assert.match(live, /<main id="main"/);
    // Live header is an overlay (slate-inscribe) that owns the single <h1>; the back link is named.
    assert.match(live, /<header className="slate-inscribe[^"]*"[\s\S]{0,400}<h1 /);
    assert.match(live, /aria-label=\{COPY\.backToTheWall\}/);
    assert.match(livePage, /WidgetErrorBoundary/);
    assert.match(play, /PlayerErrorBoundary/);
    assert.match(planner, /WidgetErrorBoundary/);
    // Search is on the kit: PageHeader owns the single <h1>, SearchInput owns the "Clear search" control.
    assert.match(search, /<PageHeader/);
    assert.match(search, /title=\{COPY\.search\}/);
    assert.match(search, /<SearchInput/);
    assert.match(src("../components/ui/input.tsx"), /aria-label="Clear search"/);
    assert.match(search, /describeError/);
    // Kit ErrorState: the boolean `heading` prop renders the page h1.
    assert.match(src("../components/not-found.tsx"), /<ErrorState[\s\S]*?\bheading\b/);
    assert.match(src("../components/archived-lesson.tsx"), /COPY.archivedClass/);
  });
});
