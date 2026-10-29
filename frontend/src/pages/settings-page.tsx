import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button, ConfirmDialog, Keys, PageBody, PageHeader, Section, Select, Surface, Switch } from "@/components/ui";
import { useTheme } from "@/components/theme-provider.tsx";
import { useChromeLocale } from "@/lib/use-locale";
import { SPEEDS, readPlayerPrefs, writePlayerPrefs, type PlayerPrefs } from "@inkboard/shared/player-prefs";
import type { ThemeMode } from "@inkboard/shared/theme";

const SHORTCUTS: Array<[string, string]> = [
  ["Ctrl K", "Search and command palette"],
  ["Ctrl B", "Library panel"],
  ["Space / K", "Play or pause"],
  ["J / L", "Back / forward 10 s"],
  ["0–9", "Jump to 0–90 %"],
  ["S", "Cycle speed"],
  ["M", "Mute"],
  ["C", "Toggle teacher camera"],
  ["T", "Toggle side panel"],
  ["F", "Fullscreen"],
  ["P / N", "Previous / next class"],
  ["I", "Pin this moment"],
  ["?", "All shortcuts"],
];

/** Local, per-device keys the app writes. Clearing them is the "start fresh" button. */
const LOCAL_KEYS = [
  "inkboard.exam.v1",
  "inkboard.favourites.v1",
  "inkboard.places.v1",
  "inkboard.later.v1",
  "inkboard.saved.v1",
  "inkboard.recent.v1",
  "inkboard.watch.v1",
  "inkboard.local.v1",
  "inkboard.prepared.v1",
  "inkboard.player.v1",
];

export default function SettingsPage() {
  const { mode, setMode } = useTheme();
  const { locale, toggle } = useChromeLocale();
  const [prefs, setPrefs] = useState<PlayerPrefs | null>(null);
  const [clearing, setClearing] = useState(false);
  useEffect(() => setPrefs(readPlayerPrefs()), []);

  function patch(p: Partial<PlayerPrefs>) {
    writePlayerPrefs(p);
    setPrefs(readPlayerPrefs());
  }

  return (
    <AppShell>
      <PageHeader eyebrow="Settings" title="Settings" subline="Saved to your account, so it follows you to any device you sign in on." />
      <PageBody className="grid max-w-2xl gap-2">
        <Section title="Appearance">
          <Surface className="grid gap-5">
            <Select
              label="Theme"
              value={mode}
              onChange={(v) => setMode(v as ThemeMode)}
              options={[
                { value: "system", label: "Match system" },
                { value: "dark", label: "Dark (board)" },
                { value: "light", label: "Light (paper)" },
              ]}
            />
            <Switch label="Hindi labels in the app chrome (preview)" description="Covers the navigation rail, home and offline notices so far; buttons and dialogs stay in English for now. Class titles stay as published." checked={locale === "hi"} onCheckedChange={() => toggle()} />
          </Surface>
        </Section>

        <Section title="Player defaults" description="Applied when a class opens. You can still change them during a class.">
          <Surface className="grid gap-5">
            {prefs ? (
              <>
                <Select
                  label="Playback speed"
                  value={String(prefs.speed)}
                  onChange={(v) => patch({ speed: Number(v) })}
                  options={SPEEDS.map((s) => ({ value: String(s), label: `${s}×` }))}
                />
                <Switch label="Start with the teacher camera hidden" checked={prefs.camOff} onCheckedChange={(v) => patch({ camOff: v })} />
                <Switch label="Start muted" checked={prefs.muted} onCheckedChange={(v) => patch({ muted: v })} />
                <Select
                  label="Camera layout"
                  value={prefs.layout}
                  onChange={(v) => patch({ layout: v as PlayerPrefs["layout"] })}
                  options={[
                    { value: "pip", label: "Floating over the board" },
                    { value: "side", label: "Beside the board" },
                  ]}
                />
              </>
            ) : null}
          </Surface>
        </Section>

        <Section title="Keyboard shortcuts">
          <Surface padded={false}>
            <dl className="divide-y divide-line">
              {SHORTCUTS.map(([k, what]) => (
                <div key={k} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                  <dt className="text-fg-muted">{what}</dt>
                  <dd>
                    <Keys combo={k} />
                  </dd>
                </div>
              ))}
            </dl>
          </Surface>
        </Section>

        <Section title="Planner">
          <Surface className="flex items-center justify-between gap-4">
            <p className="text-sm text-fg-muted">Plan preferences, backups and reminders live with the planner.</p>
            <Button variant="secondary" asChild>
              <Link to="/planner/settings">Planner settings</Link>
            </Button>
          </Surface>
        </Section>

        <Section title="This device">
          <Surface className="flex items-center justify-between gap-4">
            <p className="text-sm text-fg-muted">Clears saved courses, watch history, queue, recents and player preferences on this device. Your account copy is kept and comes back the next time you sign in. The planner is not touched.</p>
            <Button variant="danger" onClick={() => setClearing(true)}>
              Clear this device
            </Button>
          </Surface>
        </Section>
      </PageBody>
      <ConfirmDialog
        open={clearing}
        onOpenChange={setClearing}
        title="Clear this device?"
        body="This cannot be undone. The page reloads afterwards."
        confirmLabel="Clear everything"
        onConfirm={() => {
          for (const k of LOCAL_KEYS) {
            try {
              localStorage.removeItem(k);
            } catch {
              /* private mode */
            }
          }
          location.reload();
        }}
      />
    </AppShell>
  );
}
