import type { FastifyInstance } from "fastify";
import { handleSlide } from "./http/slide.ts";
import { handleNotes } from "./http/notes.ts";
import { handleLiveSlide } from "./http/live-slide.ts";
import { sendWebResponse, toWebRequest, jsonError } from "../http.ts";
import { loadShape, shapeName } from "../lib/shape-geom.ts";

export async function registerMedia(app: FastifyInstance) {
  app.get("/api/slide", async (req, reply) => {
    const ac = new AbortController();
    req.raw.on("close", () => ac.abort());
    const res = await handleSlide(toWebRequest(req, ac.signal));
    await sendWebResponse(reply, res);
  });

  app.get("/api/notes", async (req, reply) => {
    const ac = new AbortController();
    req.raw.on("close", () => ac.abort());
    const res = await handleNotes(toWebRequest(req, ac.signal));
    await sendWebResponse(reply, res);
  });

  app.get("/api/live-slide", async (req, reply) => {
    const ac = new AbortController();
    req.raw.on("close", () => ac.abort());
    const res = await handleLiveSlide(toWebRequest(req, ac.signal));
    await sendWebResponse(reply, res);
  });

  // Shape-library outlines for the live board (same flattening as replays).
  app.get<{ Querystring: { u?: string } }>("/api/board/shape", async (req, reply) => {
    const u = typeof req.query.u === "string" ? req.query.u : "";
    if (!shapeName(u)) return reply.status(400).send(jsonError(400, "Not a shape link.", "BAD_REQUEST", req.id));
    const geom = await loadShape(u);
    if (!geom) return reply.status(404).send(jsonError(404, "Shape not found.", "NOT_FOUND", req.id));
    reply.header("cache-control", "public, max-age=86400");
    return geom;
  });
}
