import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

export function pythonExecutable(configured: unknown, root: string): string {
  const selected =
    typeof configured === "string" && configured
      ? configured
      : process.env.K8S_DOCS_REVIEW_PYTHON;
  const virtual = path.join(
    root,
    ".venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
  const executable =
    selected ||
    (existsSync(virtual)
      ? virtual
      : process.platform === "win32"
        ? "python"
        : "python3");
  if (!/^python(?:\d+(?:\.\d+)*)?(?:\.exe)?$/i.test(path.basename(executable)))
    throw new Error("Choose a Python executable.");
  return executable;
}

export function litellmBridge(): Plugin {
  return {
    name: "local-litellm-review",
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
        request.on("end", () => {
          if (response.writableEnded) return;
          if (active >= 4) {
            reply(429, { error: "The four-request LLM limit was reached." });
            return;
          }
          let payload: { settings?: { pythonExecutable?: unknown } };
          let python: string;
          try {
            payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            python = pythonExecutable(
              payload.settings?.pythonExecutable,
              server.config.root,
            );
          } catch {
            reply(400, { error: "Invalid request or Python executable." });
            return;
          }
          active++;
          let released = false;
          const release = () => {
            if (!released) {
              released = true;
              active--;
            }
          };
          const child = spawn(
            python,
            [path.join(server.config.root, "llm/review.py")],
            {
              shell: false,
              windowsHide: true,
              env: {
                ...process.env,
                PYTHONIOENCODING: "utf-8",
                PYTHONUTF8: "1",
              },
            },
          );
          let output = "";
          const timeout = setTimeout(() => {
            child.kill();
            reply(504, {
              error: "The LLM request timed out after three minutes.",
            });
          }, 180_000);
          child.stderr.resume();
          child.stdout.setEncoding("utf8");
          child.stdout.on("data", (chunk: string) => {
            output += chunk;
            if (Buffer.byteLength(output) > 1024 * 1024) {
              child.kill();
              reply(502, { error: "The LLM response is too large." });
            }
          });
          child.stdin.on("error", () => {});
          child.on("error", () => {
            clearTimeout(timeout);
            release();
            reply(503, {
              error:
                "Could not start Python. Configure the Python executable in Settings and install requirements.txt.",
            });
          });
          child.on("close", (code) => {
            clearTimeout(timeout);
            release();
            if (code !== 0) {
              reply(502, {
                error:
                  "The LiteLLM helper failed. Check the Python environment and requirements.txt.",
              });
              return;
            }
            try {
              reply(200, JSON.parse(output));
            } catch {
              reply(502, {
                error: "The LiteLLM helper returned invalid JSON.",
              });
            }
          });
          response.on("close", () => {
            if (!response.writableEnded) child.kill();
          });
          child.stdin.end(JSON.stringify(payload));
        });
      });
    },
  };
}
