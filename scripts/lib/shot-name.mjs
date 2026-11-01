/**
 * Screenshot names are built from URL paths, which may carry a query string.
 * actions/upload-artifact rejects `?`, `:`, `*`, `"`, `<`, `>`, `|` in any file
 * name and one bad name fails the whole upload — so the name is reduced to
 * [A-Za-z0-9._-] before it reaches disk. "/search?q=physics" becomes
 * "search-q-physics".
 */
export function shotName(name) {
  return String(name)
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}
