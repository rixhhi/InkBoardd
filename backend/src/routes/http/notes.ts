import {
  NOTES_MAX_BYTES,
  capTitle,
  contentDisposition,
  errStatus,
  fetchAllowlisted,
  isHttpsCdn,
  isNotesUrl,
  isPdfMagic,
  readCapped,
  sanitizeFilename,
  withUpstreamSlot,
} from "@inkboard/shared/cdn-proxy";
import { notesSlug } from "@inkboard/shared/dcn";

const NOTES_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Origin: "https://unacademy.com",
  Referer: "https://unacademy.com/",
  Accept: "application/pdf,application/octet-stream,*/*",
};

export async function handleNotes(request: Request): Promise<Response> {
        const src = new URL(request.url);
        const direct = src.searchParams.get("u") || "";
        const id = (src.searchParams.get("id") || "").trim();
        const title = capTitle(src.searchParams.get("title") || "");
        const kind = src.searchParams.get("kind") === "slides" ? "slides" : "notes";
        const inline = src.searchParams.get("view") === "1";

        let pdfUrl = "";
        let filename = "class-notes.pdf";

        if (direct) {
          let parsed: URL;
          try {
            parsed = new URL(direct);
          } catch {
            return Response.json({ error: "Invalid notes link" }, { status: 400 });
          }
          if (!isNotesUrl(parsed)) {
            return Response.json({ error: "That notes host is not allowed" }, { status: 400 });
          }
          pdfUrl = parsed.toString();
          const base = parsed.pathname.split("/").pop() || filename;
          filename = sanitizeFilename(base);
        } else if (/^[A-Za-z0-9_-]{6,40}$/.test(id) && title) {
          const slug = notesSlug(title);
          const suffix = kind === "slides" ? "no_anno" : "with_anno";
          pdfUrl = `https://player.uacdn.net/slides_pdf/${id}/${slug}_${suffix}.pdf`;
          filename = sanitizeFilename(`${slug}_${kind === "slides" ? "slides" : "notes"}.pdf`);
        } else {
          return Response.json({ error: "Missing notes target" }, { status: 400 });
        }

        try {
          return await withUpstreamSlot(async () => {
            const res = await fetchAllowlisted(pdfUrl, {
              allowed: isHttpsCdn,
              headers: NOTES_HEADERS,
              signal: AbortSignal.timeout(45_000),
            });
            if (!res.ok) {
              try {
                await res.body?.cancel();
              } catch {
                /* closed */
              }
              return Response.json({ error: "Notes PDF is not on the CDN yet" }, { status: 404 });
            }
            const buf = await readCapped(res, NOTES_MAX_BYTES);
            if (!isPdfMagic(buf)) {
              return Response.json({ error: "CDN did not return a PDF" }, { status: 502 });
            }
            return new Response(Buffer.from(buf), {
              headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": contentDisposition(filename, inline),
                "Cache-Control": "public, max-age=3600",
              },
            });
          });
        } catch (err) {
          const status = errStatus(err, 502);
          const msg = err instanceof Error ? err.message : "Notes PDF is not on the CDN yet";
          return Response.json({ error: msg }, { status });
        }
}
