/**
 * Human names for browsers. A raw user-agent string is 100+ characters of
 * noise ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ..."); people
 * want "Chrome on Linux". Used when a sign-in is recorded (so the short form
 * is what gets stored) and when older rows that still hold the raw string
 * are displayed.
 */

export type DeviceName = { name: string; phone: boolean };

/** "Chrome on Android" from a user-agent string. Good enough for a device list. */
export function deviceName(ua: string | null | undefined): DeviceName {
  const s = ua || "";
  const browser = /Edg\//.test(s)
    ? "Edge"
    : /OPR\//.test(s)
      ? "Opera"
      : /Firefox\//.test(s)
        ? "Firefox"
        : /SamsungBrowser\//.test(s)
          ? "Samsung Internet"
          : /CriOS\//.test(s)
            ? "Chrome"
            : /Chrome\//.test(s)
              ? "Chrome"
              : /Safari\//.test(s)
                ? "Safari"
                : "Browser";
  const os = /Android/.test(s)
    ? "Android"
    : /iPhone|iPad|iPod/.test(s)
      ? "iOS"
      : /Windows/.test(s)
        ? "Windows"
        : /Mac OS X/.test(s)
          ? "macOS"
          : /CrOS/.test(s)
            ? "ChromeOS"
            : /Linux/.test(s)
              ? "Linux"
              : "";
  return { name: os ? `${browser} on ${os}` : browser, phone: /Android|iPhone|iPad|iPod|Mobile/.test(s) };
}

/** True when a stored label is a raw user-agent string rather than a short device name. */
export function looksLikeUserAgent(label: string | null | undefined): boolean {
  const s = label || "";
  return /^Mozilla\/\d/.test(s) || /AppleWebKit\/|Gecko\/|Trident\//.test(s);
}

/** Display form of a sign-in label: short names pass through, raw user agents are humanised. */
export function signInLabel(label: string | null | undefined): string {
  if (!label) return "";
  return looksLikeUserAgent(label) ? deviceName(label).name : label;
}
