/** First-page JPEG of an Unacademy slides PDF, served through our image proxy. Filmstrip only — never card thumbs. */
export function slidePosterUrl(pdfUrl: string | null | undefined): string {
  const pdf = String(pdfUrl || "").trim();
  if (!pdf) return "";
  let href = pdf;
  if (!/[?&]page=/.test(href)) href += `${href.includes("?") ? "&" : "?"}page=1`;
  try {
    const host = new URL(href).hostname;
    if (host !== "uacdn.net" && !host.endsWith(".uacdn.net")) return "";
    return `/api/slide?u=${encodeURIComponent(href)}`;
  } catch {
    return "";
  }
}

const RASTER_HOST = /(^|\.)uacdn\.net$|(^|\.)unacademy\.com$/i;
const RASTER_EXT = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i;

/** Real raster covers on Unacademy CDNs. Never PDFs or /api/slide. */
export function rasterThumbUrl(url: string | null | undefined): string {
  const src = String(url || "").trim();
  if (!src) return "";
  if (src.startsWith("/api/slide")) return "";
  if (/\.pdf(\?|$)/i.test(src) || /[?&]page=\d+/i.test(src)) return "";
  try {
    const u = new URL(src);
    if (u.protocol !== "https:") return "";
    if (!RASTER_HOST.test(u.hostname)) return "";
    const path = u.pathname.toLowerCase();
    if (path.includes(".pdf")) return "";
    if (RASTER_EXT.test(path) || /thumbnail|processed_image|cover_photo|webstatic|post_thumbnail/.test(path)) {
      return src;
    }
    return "";
  } catch {
    return "";
  }
}

export function posterTone(status?: string | null) {
  if (status === "live") return "bg-danger/25 text-danger";
  if (status === "upcoming") return "bg-warn/20 text-warn";
  if (status === "archived" || status === "unavailable") return "bg-elevated text-faint";
  return "bg-chip text-primary";
}

/** Prefer Unacademy studio PNGs (dark field + white mark + full pose) over JPEG headshots. */
export function studioAvatar(...cands: unknown[]): string {
  const urls = cands.map((s) => String(s ?? "").trim()).filter(Boolean);

  const studio = urls.find((u) => /educator_new\/processed_(image|thumbnail)/i.test(u));
  if (studio) return studio;
  return urls[0] || "";
}

export function isEducatorAvatar(url: string | null | undefined): boolean {
  const u = String(url || "").toLowerCase();
  if (!u) return false;
  return /educator[_/]|\/avatar|avatars\/|profile_pic|old_avatar|processed_thumbnail|\/thumbnail\/user\//.test(u);
}

/**
 * Real cover art only. If Unacademy gave no thumbnail, or the "cover" is just
 * the teacher's face, return empty so the card can show a compact avatar row.
 */
export function bannerUrl(cover?: string | null, avatar?: string | null): string {
  const src = rasterThumbUrl(cover) || "";
  if (!src) return "";
  const av = String(avatar || "").trim();
  if (av && src === av) return "";
  if (isEducatorAvatar(src)) return "";
  return src;
}
