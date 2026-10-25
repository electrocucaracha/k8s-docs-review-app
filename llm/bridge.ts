import type { Plugin } from "vite";
import { reviewLLM, validateReviewRequest } from "../src/llmReview.js";
import type { LLMRequest } from "../src/llm.js";

export function llmBridge(): Plugin {
  return {
    name: "local-llm-review",
    configureServer(server) {
      let active = 0;
      server.middlewares.use("/api/llm/review", (request, response) => {
        const reply = (status: number, value: unknown) => {
          if (response.writableEnded || response.destroyed) return;
          response.statusCode = status;
          response.setHeader("Content-Type", "application/json");
          response.setHeader("Cache-Control", "no-store");
          response.end(JSON.stringify(value));
        };
        if (request.method !== "POST") {
          reply(405, { error: "Use POST for LLM review." });
          return;
        }
        if (
          request.headers.origin !== `http://${request.headers.host}` ||
          !/^application\/json(?:;|$)/i.test(
            request.headers["content-type"] ?? "",
          )
        ) {
          reply(403, { error: "Only same-origin JSON requests are accepted." });
          return;
        }
        if (active >= 4) {
          reply(429, { error: "The four-request LLM limit was reached." });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        request.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size <= 1024 * 1024) chunks.push(chunk);
          else reply(413, { error: "The LLM request exceeds 1 MB." });
        });
        request.on("error", () =>
          reply(400, { error: "Could not read the LLM request." }),
        );
        request.on("end", async () => {
          if (response.writableEnded || response.destroyed) return;
          if (active >= 4) {
            reply(429, { error: "The four-request LLM limit was reached." });
            return;
          }
          let payload: LLMRequest;
          try {
            payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            validateReviewRequest(payload);
          } catch {
            reply(400, { error: "Invalid LLM review request or settings." });
            return;
          }
          active++;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 180_000);
          response.on("close", () => {
            if (!response.writableEnded) controller.abort();
          });
          try {
            reply(
              200,
              await reviewLLM(payload, {
                environment: process.env,
                signal: controller.signal,
                log: (entry) =>
                  server.config.logger.info(`[llm] ${JSON.stringify(entry)}`, {
                    timestamp: true,
                  }),
              }),
            );
          } catch (error) {
            reply(controller.signal.aborted ? 504 : 502, {
              error:
                error instanceof Error
                  ? error.message
                  : "The LLM review failed.",
            });
          } finally {
            clearTimeout(timeout);
            active--;
          }
        });
      });
    },
  };
}
