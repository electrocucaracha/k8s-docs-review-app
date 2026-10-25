import type { Plugin } from "vite";
import { EnvHttpProxyAgent, fetch } from "undici";
import { documentationUrl } from "../src/documentationUrl.js";

export function publishedReferenceBridge(): Plugin {
  return {
    name: "published-documentation-checks",
    configureServer(server) {
      let active = 0;
      const dispatcher = new EnvHttpProxyAgent();
      server.httpServer?.once("close", () => {
        void dispatcher.close();
      });
      server.middlewares.use("/api/references/check", (request, response) => {
        const reply = (status: number, value: unknown) => {
          if (response.writableEnded || response.destroyed) return;
          response.statusCode = status;
          response.setHeader("Content-Type", "application/json");
          response.setHeader("Cache-Control", "no-store");
          response.end(JSON.stringify(value));
        };
        if (request.method !== "POST") {
          reply(405, { error: "Use POST to check a reference." });
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
        const chunks: Buffer[] = [];
        let size = 0;
        request.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size <= 8192) chunks.push(chunk);
          else reply(413, { error: "Reference request is too large." });
        });
        request.on("error", () =>
          reply(400, { error: "Could not read the reference request." }),
        );
        request.on("end", () => {
          if (response.writableEnded) return;
          let target: URL;
          try {
            const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (typeof payload.url !== "string" || payload.url.length > 2048)
              throw new Error();
            target = documentationUrl(payload.url);
          } catch {
            reply(400, {
              error: "Only HTTPS Kubernetes documentation URLs can be checked.",
            });
            return;
          }
          if (active >= 4) {
            reply(429, {
              error: "The four-request reference check limit was reached.",
            });
            return;
          }
          active++;
          void (async () => {
            const original = target.href;
            const signal = AbortSignal.timeout(15_000);
            try {
              for (let redirects = 0; redirects <= 5; redirects++) {
                const result = await fetch(target, {
                  dispatcher,
                  redirect: "manual",
                  credentials: "omit",
                  signal,
                  headers: {
                    Accept: "text/html",
                    "User-Agent":
                      "K8sDocsReview/0.1 (documentation-reference-check)",
                  },
                });
                await result.body?.cancel();
                if ([301, 302, 303, 307, 308].includes(result.status)) {
                  const location = result.headers.get("location");
                  if (!location || redirects === 5)
                    throw new Error("Redirect could not be verified.");
                  target = documentationUrl(new URL(location, target).href);
                  continue;
                }
                reply(200, {
                  url: original,
                  finalUrl: target.href,
                  status: result.status,
                });
                return;
              }
            } catch {
              reply(200, {
                url: original,
                error:
                  "Network timeout, blocked request, or redirect outside Kubernetes documentation",
              });
            } finally {
              active--;
            }
          })();
        });
      });
    },
  };
}
