/** Reject loopback, private, and link-local targets before a proxy fetch. */

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
]);

function ipv4Parts(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1).map((n) => Number(n));
  if (parts.some((n) => n > 255)) return null;
  return parts;
}

export function isPrivateAddress(host: string): boolean {
  const name = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!name || BLOCKED_HOSTS.has(name) || name.endsWith(".localhost") || name.endsWith(".internal")) return true;
  if (name === "::1" || name === "0:0:0:0:0:0:0:1") return true;
  if (name.startsWith("fe80:") || name.startsWith("fc") || name.startsWith("fd")) return true;
  const mapped = name.startsWith("::ffff:") ? name.slice(7) : name;
  const v4 = ipv4Parts(mapped);
  if (!v4) return false;
  const a = v4[0];
  const b = v4[1];
  if (a === undefined || b === undefined) return false;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

/** Throws when the URL is not a public http(s) target. */
export function assertPublicUrl(url: URL): void {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Blocked address");
  if (isPrivateAddress(url.hostname)) throw new Error("Blocked address");
}

export function isIpLiteral(host: string): boolean {
  const name = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (ipv4Parts(name)) return true;
  return name.includes(":");
}

export type HostLookup = (hostname: string) => Promise<string[]>;

let hostLookup: HostLookup | null = null;

/** Install the process-wide DNS check. Returns a function that puts the previous one back. */
export function installHostLookup(fn: HostLookup | null): () => void {
  const previous = hostLookup;
  hostLookup = fn;
  return () => {
    hostLookup = previous;
  };
}

export function hostLookupInstalled(): boolean {
  return hostLookup !== null;
}

/** Real DNS lookup used by the API process. Not used by the hop tests. */
export async function lookupHost(hostname: string): Promise<string[]> {
  const { lookup } = await import("node:dns/promises");
  const rows = await Promise.race([
    lookup(hostname, { all: true, verbatim: true }),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("dns timeout")), 1500);
    }),
  ]);
  return rows.map((row) => row.address);
}

/** Resolve a hostname when a lookup is installed. IP literals are already checked. */
export async function rejectReboundHost(hostname: string): Promise<void> {
  if (isPrivateAddress(hostname)) throw new Error("Blocked address");
  if (!hostLookup || isIpLiteral(hostname)) return;
  let addresses: string[] = [];
  try {
    addresses = await hostLookup(hostname);
  } catch {
    throw new Error("Blocked address");
  }
  if (addresses.length === 0) throw new Error("Blocked address");
  assertPublicAddresses(addresses);
}

export function assertPublicAddresses(addresses: string[]): void {
  for (const address of addresses) {
    if (isPrivateAddress(address)) throw new Error("Blocked address");
  }
}
