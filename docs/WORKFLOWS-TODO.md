# CI changes to apply by hand

The review branch could not push `.github/workflows/*` — the GitHub App that pushed it has no
`workflows` permission. Two changes are held here instead. From the repo root, on `main`:

```bash
git apply docs/workflows.patch                      # moves the Lighthouse step into the e2e job
cp docs/keepalive.workflow.yml .github/workflows/keepalive.yml
git add .github/workflows && git commit -m "ci: lighthouse against the real stack; keepalive ping"
git rm docs/workflows.patch docs/keepalive.workflow.yml docs/WORKFLOWS-TODO.md && git commit -m "docs: workflow patch applied"
```

What they do:

1. **`ci.yml`** — the `lighthouse` step moves from the `check` job (where it ran `vite preview` with no
   API and audited an error page) into the `e2e` job, after the real API + SSR + edge are up. The new
   `lighthouserc.json` (already on this branch) points at `http://127.0.0.1:3000/login`.
2. **`keepalive.yml`** — pings the API `/healthz` every 10 minutes so a free Render instance never sleeps
   (members otherwise see a ~30 s hang on first sign-in). Override the URL list with a repo variable
   `KEEPALIVE_URLS` (comma-separated).

Until (1) is applied, the existing `lighthouse` step in `check` will **fail** on this branch because
`lighthouserc.json` no longer has a `startServerCommand`. Apply the patch before merging, or merge and
apply immediately after.
