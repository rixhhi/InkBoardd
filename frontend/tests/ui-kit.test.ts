import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";

/**
 * The new kit (components/ui/*). These tests assert on roles, names and
 * ARIA state only. If a test here needs a class name, the component is wrong.
 */

async function mount() {
  const dom = new JSDOM(`<!doctype html><html lang="en"><body><div id="root"></div></body></html>`, {
    url: "http://127.0.0.1/",
    pretendToBeVisual: true,
  });
  const g = globalThis as Record<string, unknown>;
  for (const k of ["window", "document", "HTMLElement", "Element", "Node", "SVGElement", "MutationObserver", "getComputedStyle", "KeyboardEvent", "MouseEvent", "Event"]) {
    g[k] = (dom.window as unknown as Record<string, unknown>)[k];
  }
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number;
  g.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  (dom.window as unknown as { matchMedia: unknown }).matchMedia = g.matchMedia;
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { act } = React;
  const host = dom.window.document.getElementById("root")!;
  const root = createRoot(host);
  return {
    doc: dom.window.document,
    React,
    async render(el: React.ReactElement) {
      await act(async () => root.render(el));
    },
    async click(el: Element) {
      await act(async () => {
        el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      });
    },
    async key(el: Element, key: string) {
      await act(async () => {
        el.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key, bubbles: true }));
      });
    },
    unmount: () => act(() => root.unmount()),
  };
}

describe("ui kit", () => {
  it("Button exposes busy state and keeps a name while loading", async () => {
    const m = await mount();
    const { Button } = await import("../src/components/ui/index.ts");
    await m.render(m.React.createElement(Button, { loading: true }, "Save"));
    const btn = m.doc.querySelector("button")!;
    assert.equal(btn.getAttribute("aria-busy"), "true");
    assert.equal(btn.disabled, true);
    assert.match(btn.textContent ?? "", /Save/);
    await m.unmount();
  });

  it("IconButton always has an accessible name", async () => {
    const m = await mount();
    const { IconButton } = await import("../src/components/ui/index.ts");
    const { Play } = await import("lucide-react");
    await m.render(m.React.createElement(IconButton, { label: "Play", icon: Play, pressed: true }));
    const btn = m.doc.querySelector("button")!;
    assert.equal(btn.getAttribute("aria-label"), "Play");
    assert.equal(btn.getAttribute("aria-pressed"), "true");
    await m.unmount();
  });

  it("Tabs are a tablist with roving focus and arrow keys", async () => {
    const m = await mount();
    const { Tabs, TabPanel } = await import("../src/components/ui/index.ts");
    let value = "a";
    const tabs = [
      { id: "a", label: "Alpha" },
      { id: "b", label: "Beta" },
    ];
    const draw = () =>
      m.render(
        m.React.createElement(
          m.React.Fragment,
          null,
          m.React.createElement(Tabs, {
            tabs,
            value,
            label: "Sections",
            onChange: (id: string) => {
              value = id;
              void draw();
            },
          }),
          m.React.createElement(TabPanel, { id: value, active: true, children: value }),
        ),
      );
    await draw();
    const list = m.doc.querySelector('[role="tablist"]')!;
    assert.equal(list.getAttribute("aria-label"), "Sections");
    const [a, b] = [...m.doc.querySelectorAll('[role="tab"]')];
    assert.equal(a!.getAttribute("aria-selected"), "true");
    assert.equal(b!.getAttribute("tabindex"), "-1");
    await m.key(a!, "ArrowRight");
    assert.equal(value, "b");
    assert.equal(m.doc.querySelector('[role="tabpanel"]')?.textContent, "b");
    await m.unmount();
  });

  it("Switch is role=switch and flips aria-checked", async () => {
    const m = await mount();
    const { Switch } = await import("../src/components/ui/index.ts");
    let on = false;
    const draw = () => m.render(m.React.createElement(Switch, { checked: on, label: "Skip silence", onCheckedChange: (v: boolean) => { on = v; void draw(); } }));
    await draw();
    const sw = m.doc.querySelector('[role="switch"]')!;
    assert.equal(sw.getAttribute("aria-checked"), "false");
    assert.ok(m.doc.querySelector("label")?.textContent?.includes("Skip silence"));
    await m.click(sw);
    assert.equal(on, true);
    await m.unmount();
  });

  it("ErrorState derives kind from the error and renders an h1 when asked", async () => {
    const m = await mount();
    const { ErrorState, errorKind } = await import("../src/components/ui/index.ts");
    assert.equal(errorKind({ status: 404 }), "not-found");
    assert.equal(errorKind({ status: 429 }), "rate-limit");
    assert.equal(errorKind({ status: 502, code: "UPSTREAM" }), "upstream");
    assert.equal(errorKind({ status: 0, code: "NETWORK" }), "offline");
    assert.equal(errorKind(new Error("x")), "generic");
    let retried = 0;
    await m.render(m.React.createElement(ErrorState, { error: { status: 502, code: "UPSTREAM" }, heading: true, onRetry: () => { retried += 1; } }));
    const alert = m.doc.querySelector('[role="alert"]')!;
    assert.ok(alert);
    assert.match(m.doc.querySelector("h1")?.textContent ?? "", /catalog/i);
    await m.click(m.doc.querySelector("button")!);
    assert.equal(retried, 1);
    await m.unmount();
  });

  it("ErrorState disables retry during a rate-limit countdown", async () => {
    const m = await mount();
    const { ErrorState } = await import("../src/components/ui/index.ts");
    await m.render(m.React.createElement(ErrorState, { kind: "rate-limit", retryAfterSec: 30, onRetry: () => {} }));
    const btn = m.doc.querySelector("button")!;
    assert.equal(btn.disabled, true);
    assert.match(m.doc.body.textContent ?? "", /30s/);
    await m.unmount();
  });

  it("SearchInput has a clear button and a polite result count", async () => {
    const m = await mount();
    const { SearchInput } = await import("../src/components/ui/index.ts");
    let v = "phys";
    await m.render(m.React.createElement(SearchInput, { label: "Search", value: v, onChange: (n: string) => { v = n; }, resultCount: 3 }));
    const input = m.doc.querySelector("input")!;
    assert.equal(input.getAttribute("aria-label"), "Search");
    const live = m.doc.getElementById(input.getAttribute("aria-describedby")!)!;
    assert.equal(live.getAttribute("aria-live"), "polite");
    assert.match(live.textContent ?? "", /3 results/);
    await m.click(m.doc.querySelector('button[aria-label="Clear search"]')!);
    assert.equal(v, "");
    await m.unmount();
  });

  it("ListRow marks the current item and keeps nested controls clickable", async () => {
    const m = await mount();
    const { ListRow, List } = await import("../src/components/ui/index.ts");
    let opened = 0;
    let saved = 0;
    await m.render(
      m.React.createElement(List, {
        label: "Lessons",
        children: m.React.createElement(ListRow, {
          title: "Kinematics",
          current: true,
          onActivate: () => { opened += 1; },
          trailing: m.React.createElement("button", { type: "button", onClick: () => { saved += 1; } }, "Save"),
        }),
      }),
    );
    const row = m.doc.querySelector("li")!;
    assert.equal(row.getAttribute("aria-current"), "true");
    assert.equal(m.doc.querySelector("ul")?.getAttribute("aria-label"), "Lessons");
    await m.click(m.doc.querySelector("button")!);
    assert.equal(saved, 1);
    assert.equal(opened, 0, "a click on a nested control does not also activate the row");
    await m.click(row);
    assert.equal(opened, 1);
    await m.unmount();
  });

  it("PageHeader renders exactly one h1 and a breadcrumb nav", async () => {
    const m = await mount();
    const { PageHeader } = await import("../src/components/ui/index.ts");
    // Link needs a router; crumbs without `to` render as text, which is what we test here.
    await m.render(m.React.createElement(PageHeader, { title: "Kinematics", eyebrow: "Course", crumbs: [{ label: "IIT JEE" }, { label: "Kinematics" }] }));
    assert.equal(m.doc.querySelectorAll("h1").length, 1);
    assert.equal(m.doc.querySelector('nav[aria-label="Breadcrumb"] [aria-current="page"]')?.textContent, "Kinematics");
    await m.unmount();
  });

  it("Avatar falls back to initials with an img role", async () => {
    const m = await mount();
    const { Avatar } = await import("../src/components/ui/index.ts");
    await m.render(m.React.createElement(Avatar, { name: "Brijesh Jindal" }));
    const el = m.doc.querySelector('[role="img"]')!;
    assert.equal(el.getAttribute("aria-label"), "Brijesh Jindal");
    assert.equal(el.textContent, "BJ");
    await m.unmount();
  });

  it("Badge live tone carries its text, not just colour", async () => {
    const m = await mount();
    const { Badge } = await import("../src/components/ui/index.ts");
    await m.render(m.React.createElement(Badge, { tone: "live", children: "Live" }));
    assert.match(m.doc.body.textContent ?? "", /Live/);
    await m.unmount();
  });
});
