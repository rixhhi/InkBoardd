/**
 * Accounts, sessions, groups, shares, activity and per-user app state.
 *
 * Storage: Postgres (DATABASE_URL, e.g. Neon) or embedded PGlite when unset — see db.ts.
 * Every table is prefixed `ib_` so it can share a database with the catalog cache.
 *
 * Roles
 *   superadmin — the account created by /api/auth/setup (exactly one). Manages admins.
 *   admin      — created by the super admin. Manages members, groups, sharing, settings.
 *   member     — created by any admin. Sees what is shared with them.
 *
 * Activity retention
 *   raw events (ib_activity)     → 1 hour, then deleted by sweep()
 *   daily totals (ib_daily*)     → 400 days (charts, watch time, most watched)
 *   admin audit log (ib_audit)   → 90 days
 *
 * Hot paths (session lookup, a member's active shares, settings) are cached in
 * memory for a few seconds and invalidated on every write, so the database adds
 * no latency to normal page loads.
 */
export * from "./store/types.ts";
export { store, openAuthStore, closeAuthStore, storeKind, runMigrations, appliedMigrations, MIGRATIONS, type Migration } from "./store/connection.ts";
export { bumpShares } from "./store/cache.ts";
export * from "./store/passwords.ts";
export * from "./store/accounts.ts";
export * from "./store/settings.ts";
export * from "./store/groups.ts";
export * from "./store/shares.ts";
export * from "./store/activity.ts";
export * from "./store/state.ts";
export * from "./store/retention.ts";
export * from "./store/notifications.ts";
