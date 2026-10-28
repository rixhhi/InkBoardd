import type { FastifyInstance } from "fastify";
import { handleLiveBoard } from "./http/live-board.ts";
import { sendWebResponse, toWebRequest } from "../http.ts";

export async function registerLive(app: FastifyInstance) {
  app.get("/api/live-board", async (req, reply) => {
    const ac = new AbortController();
    req.raw.on("close", () => ac.abort());
    const res = await handleLiveBoard(toWebRequest(req, ac.signal), req.ip);
    await sendWebResponse(reply, res);
  });
}
