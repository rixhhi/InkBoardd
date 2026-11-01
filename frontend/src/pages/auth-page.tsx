import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { KeyRound, LogIn, ShieldCheck } from "lucide-react";
import { Button, Field, Input, Surface } from "@/components/ui";
import { DeskSkip } from "@/components/folio/skip-link";
import { describeError } from "@/lib/api-client";
import { AUTH_KEY, ME_KEY, isStaffRole, sendJson, signOut, useAuthStatus, type SessionUser } from "@/lib/session";

/** Only same-site paths are followed after sign-in. */
export function safeNext(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\") || raw.startsWith("/login") || raw.startsWith("/setup")) return "/";
  return raw;
}

function Frame({ title, subtitle, icon: Icon, children }: { title: string; subtitle: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <>
      <DeskSkip />
      <main id="main" className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-2 font-serif text-lg font-semibold text-fg">
            <span aria-hidden="true" className="grid size-8 place-items-center rounded-md bg-fg text-sm text-bg">
              I
            </span>
            Inkboard
          </div>
          <Surface className="p-6 sm:p-7">
            <div className="mb-5 flex items-start gap-3">
              <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-subtle text-accent">
                <Icon className="size-5" />
              </span>
              <div className="min-w-0">
                <h1 className="font-serif text-2xl text-fg">{title}</h1>
                <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>
              </div>
            </div>
            {children}
          </Surface>
          <p className="mt-4 text-center text-xs text-fg-faint">Private study desk. Accounts are created by the admin.</p>
        </div>
      </main>
    </>
  );
}

function useFinish() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  return async (user: SessionUser) => {
    qc.setQueryData(AUTH_KEY, { needsSetup: false, user });
    await qc.invalidateQueries({ queryKey: ME_KEY });
    const next = safeNext(search.next);
    void nav({ to: next === "/" && isStaffRole(user.role) ? "/admin" : next, replace: true });
  };
}

export function LoginPage() {
  const status = useAuthStatus();
  const finish = useFinish();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reset, setReset] = useState<"idle" | "sending" | "sent">("idle");

  async function askForReset() {
    if (!email || reset !== "idle") return;
    setReset("sending");
    try {
      await sendJson("/api/auth/reset-request", "POST", { email });
    } catch {
      /* the answer is the same either way; the admin side is what matters */
    }
    setReset("sent");
  }

  useEffect(() => {
    if (status.data?.needsSetup) void nav({ to: "/setup", replace: true });
    else if (status.data?.user) void nav({ to: isStaffRole(status.data.user.role) ? "/admin" : "/", replace: true });
  }, [status.data, nav]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await sendJson<{ user: SessionUser }>("/api/auth/login", "POST", { email, password });
      await finish(res.user);
    } catch (err) {
      setError(describeError(err).body || "Could not sign in.");
      setBusy(false);
    }
  }

  return (
    <Frame title="Sign in" subtitle="Use the email and password your admin gave you." icon={LogIn}>
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <Field label="Email">
          {(p) => <Input {...p} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />}
        </Field>
        <Field label="Password" error={error ?? undefined}>
          {(p) => <Input {...p} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Button type="submit" size="lg" loading={busy} disabled={!email || !password} className="w-full">
          Sign in
        </Button>
      </form>
      <div className="mt-4 text-xs text-fg-muted">
        {reset === "sent" ? (
          <p role="status">If that account exists, your admin has been told. They will set a new password and share it with you.</p>
        ) : (
          <p>
            Forgot your password?{" "}
            <button
              type="button"
              onClick={askForReset}
              disabled={!email || reset === "sending"}
              aria-describedby={!email ? "reset-hint" : undefined}
              className="font-medium text-accent underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {reset === "sending" ? "Telling your admin…" : "Ask your admin to reset it"}
            </button>
            {/* Inline, not a title= tooltip: tooltips never show on touch screens. */}
            {!email ? (
              <span id="reset-hint" className="text-fg-faint">
                {" "}
                — type your email first
              </span>
            ) : null}
          </p>
        )}
      </div>
    </Frame>
  );
}

type SetupForm = { code: string; name: string; email: string; password: string; confirm: string };

export function SetupPage() {
  const status = useAuthStatus();
  const finish = useFinish();
  const nav = useNavigate();
  const [form, setForm] = useState<SetupForm>({ code: "", name: "", email: "", password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: keyof SetupForm | "form"; text: string } | null>(null);

  useEffect(() => {
    if (status.data && !status.data.needsSetup) void nav({ to: status.data.user ? "/" : "/login", replace: true });
  }, [status.data, nav]);

  const set = (k: keyof SetupForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError({ field: "confirm", text: "The two passwords don't match." });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await sendJson<{ user: SessionUser }>("/api/auth/setup", "POST", { code: form.code, name: form.name, email: form.email, password: form.password });
      await finish(res.user);
    } catch (err) {
      const body = describeError(err).body;
      const field: keyof SetupForm | "form" = /code/i.test(body) ? "code" : /email/i.test(body) ? "email" : /password|characters|letters/i.test(body) ? "password" : "form";
      setError({ field, text: body });
      setBusy(false);
    }
  }

  const err = (k: keyof SetupForm) => (error?.field === k ? error.text : undefined);

  return (
    <Frame title="Create the super admin" subtitle="This runs once. The super admin adds admins and members, and decides what members can open." icon={ShieldCheck}>
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <Field label="Setup code" hint="Printed in the server log and saved in backend/data/setup-code.txt." error={err("code")}>
          {(p) => <Input {...p} autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} required value={form.code} onChange={set("code")} autoFocus className="font-mono tracking-widest uppercase" />}
        </Field>
        <Field label="Your name">{(p) => <Input {...p} autoComplete="name" value={form.name} onChange={set("name")} />}</Field>
        <Field label="Email" error={err("email")}>
          {(p) => <Input {...p} type="email" autoComplete="username" required value={form.email} onChange={set("email")} />}
        </Field>
        <Field label="Password" hint="At least 10 characters, with letters and a number." error={err("password")}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" required value={form.password} onChange={set("password")} />}
        </Field>
        <Field label="Confirm password" error={err("confirm")}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" required value={form.confirm} onChange={set("confirm")} />}
        </Field>
        {error?.field === "form" ? (
          <p role="alert" className="text-sm text-danger">
            {error.text}
          </p>
        ) : null}
        <Button type="submit" size="lg" icon={KeyRound} loading={busy} disabled={!form.code || !form.email || !form.password} className="w-full">
          Create super admin and sign in
        </Button>
      </form>
    </Frame>
  );
}

export function LoginRoutePage() {
  return <LoginPage />;
}

export function SetupRoutePage() {
  return <SetupPage />;
}

/** Shown instead of every page until a person with a temporary password picks their own. */
export function ForcedPasswordPage() {
  const qc = useQueryClient();
  const status = useAuthStatus();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = status.data?.user?.name ?? "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      setError("The two new passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await sendJson<{ user: SessionUser }>("/api/me/password", "POST", { current, next });
      qc.setQueryData(AUTH_KEY, { needsSetup: false, user: res.user });
      await qc.invalidateQueries({ queryKey: ME_KEY });
    } catch (err) {
      setError(describeError(err).body || "Could not change the password.");
      setBusy(false);
    }
  }

  return (
    <Frame title="Choose your password" subtitle={`${name ? `Welcome, ${name}. ` : ""}Your admin gave you a temporary password. Pick your own to continue.`} icon={KeyRound}>
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <Field label="Temporary password">
          {(p) => <Input {...p} type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />}
        </Field>
        <Field label="New password" hint="At least 10 characters, with letters and a number.">
          {(p) => <Input {...p} type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />}
        </Field>
        <Field label="Repeat new password" error={error ?? undefined}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
        </Field>
        <Button type="submit" size="lg" loading={busy} disabled={!current || !next || !confirm} className="w-full">
          Save and continue
        </Button>
        <Button variant="ghost" onClick={() => void signOut(qc)}>
          Sign out
        </Button>
      </form>
    </Frame>
  );
}
