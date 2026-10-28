export function friendlyBundleError(err: unknown): { title: string; body: string; code: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (lower.includes("unsupported bundle version") || lower.includes("unknown version") || lower.includes("unknown format")) {
    return {
      code: "version",
      title: "This class was saved with a newer Inkboard",
      body: raw,
    };
  }
  if (lower.includes("showdirectorypicker") || lower.includes("unsupported browser")) {
    return {
      code: "browser",
      title: "This browser cannot open a folder",
      body: "Use Chrome or Edge to open a saved class folder, or open a .zip instead.",
    };
  }
  if (lower.includes("no manifest") || lower.includes("incomplete")) {
    return {
      code: "incomplete",
      title: "This folder is not a complete class",
      body: "The save did not finish. Look for a lecture-… folder with a manifest.json inside.",
    };
  }
  if (lower.includes("sha256") || lower.includes("checksum") || (lower.includes("size") && lower.includes("!="))) {
    return {
      code: "checksum",
      title: "This class does not match its checksum",
      body: "A file changed after it was saved. You can continue anyway, or save the class again.",
    };
  }
  if (lower.includes("media") && lower.includes("missing")) {
    return {
      code: "media",
      title: "The recording is missing",
      body: "media.webm was not in this folder. The board may still open if the ink is there.",
    };
  }
  return { code: "error", title: "This class did not open", body: raw };
}
