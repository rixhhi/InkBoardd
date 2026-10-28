import { SETTING_TTL, bumpShares, settingCache } from "./cache.ts";
import { one, q } from "./connection.ts";
import type { AccessMode, MemberPermissions } from "./types.ts";

/* ---------------- settings ---------------- */

export async function getSetting(key: string, fallback: string): Promise<string> {
  const hit = settingCache.get(key);
  if (hit && Date.now() - hit.at < SETTING_TTL) return hit.value;
  const row = await one<{ value: string }>("select value from ib_settings where key = $1", [key]);
  const value = row?.value ?? fallback;
  settingCache.set(key, { value, at: Date.now() });
  return value;
}

export async function setSetting(key: string, value: string) {
  await q("insert into ib_settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value", [key, value]);
  settingCache.delete(key);
  bumpShares();
}

export async function accessMode(): Promise<AccessMode> {
  return (await getSetting("access_mode", "curated")) === "open" ? "open" : "curated";
}

export const DEFAULT_PERMISSIONS: MemberPermissions = { live: true, planner: true, downloads: false, search: false, browse: false };

export async function memberPermissions(): Promise<MemberPermissions> {
  try {
    const raw = JSON.parse(await getSetting("member_permissions", "{}")) as Partial<MemberPermissions>;
    return { ...DEFAULT_PERMISSIONS, ...Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "boolean")) };
  } catch {
    return { ...DEFAULT_PERMISSIONS };
  }
}
