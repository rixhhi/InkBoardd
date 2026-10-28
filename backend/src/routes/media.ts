import type { FastifyInstance } from "fastify";
import { handleSlide } from "./http/slide.ts";
import { handleNotes } from "./http/notes.ts";
import { handleLiveSlide } from "./http/live-slide.ts";
import { sendWebResponse, toWebRequest } from "../http.ts";

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
}
