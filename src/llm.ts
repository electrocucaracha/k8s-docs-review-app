import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Finding } from "./review.js";
import { defaultTasks, migrateReviewTasks, validateTasks } from "./reviewTasks.js";
import type { ReviewTask } from "./reviewTasks.js";
import type { TaskRun } from "./reviewTasks.js";
import { readCache, writeCache } from "./localCache.js";

export type Provider =
  | "ollama"
  | "openai"
  | "anthropic"
  | "gemini"
  | "openai-compatible";
export type LLMSettings = {
  provider: Provider;
  model: string;
  apiBase: string;
  apiKey: string;
  tasks: ReviewTask[];
  concurrency: number;
};
export type LLMResult = {
  findings: Finding[];
  model: string;
};
export type LLMRequest = {
  action: "review" | "test";
  settings: LLMSettings;
  english?: string;
  spanish?: string;
  language?: string;
  task?: ReviewTask;
  reviewComments?: { path: string; line: number | null; body: string }[];
};

export const providerDefaults: Record<
  Provider,
  Omit<LLMSettings, "tasks" | "concurrency">
> = {
  ollama: {
    provider: "ollama",
    model: "qwen3.8:27b-q4_K_M",
    apiBase: "http://127.0.0.1:11434",
    apiKey: "",
  },
  openai: {
    provider: "openai",
    model: "gpt-4o-mini",
    apiBase: "https://api.openai.com/v1",
    apiKey: "",
  },
  anthropic: {
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    apiBase: "https://api.anthropic.com",
    apiKey: "",
  },
  gemini: {
    provider: "gemini",
    model: "gemini-2.5-flash",
    apiBase: "",
    apiKey: "",
  },
  "openai-compatible": {
    provider: "openai-compatible",
    model: "local-model",
    apiBase: "http://127.0.0.1:4000/v1",
    apiKey: "",
  },
};

export const defaultSettings: LLMSettings = {
  ...providerDefaults.ollama,
  tasks: defaultTasks.map((task) => ({ ...task })),
  concurrency: 1,
};
const storageKey = "k8s-docs-review.llm-settings";

export function validateSettings(settings: LLMSettings): void {
  if (!settings || typeof settings !== "object")
    throw new Error("Invalid LLM settings.");
  validateTasks(settings.tasks, settings.concurrency);
  if (!Object.hasOwn(providerDefaults, settings.provider))
    throw new Error("Select a supported provider.");
  if (typeof settings.model !== "string" || !settings.model.trim() || settings.model.length > 200)
    throw new Error("Enter a model name of at most 200 characters.");
  if (typeof settings.apiBase !== "string" || settings.apiBase.length > 2048)
    throw new Error("Invalid provider endpoint.");
  if (typeof settings.apiKey !== "string" || settings.apiKey.length > 4096)
    throw new Error("Invalid provider API key.");
  if (settings.apiBase) {
    let url: URL;
    try {
      url = new URL(settings.apiBase);
    } catch {
      throw new Error("Enter a valid provider endpoint.");
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error(
        "Use an HTTP(S) endpoint without credentials or query parameters.",
      );
    if (
      settings.provider !== "ollama" &&
      url.protocol === "http:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
      throw new Error("Remote provider endpoints must use HTTPS.");
  } else if (["ollama", "openai-compatible"].includes(settings.provider))
    throw new Error("This provider requires an API endpoint.");
}

export function loadSettings(): LLMSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    if (!saved || !Object.hasOwn(providerDefaults, saved.provider))
      return { ...defaultSettings };
    const settings: LLMSettings = {
      ...providerDefaults[saved.provider as Provider],
      model:
        typeof saved.model === "string"
          ? saved.model
          : providerDefaults[saved.provider as Provider].model,
      apiBase:
        typeof saved.apiBase === "string"
          ? saved.apiBase
          : providerDefaults[saved.provider as Provider].apiBase,
      apiKey: "",
      tasks: migrateReviewTasks(
        Array.isArray(saved.tasks) ? saved.tasks : undefined,
        saved.taskSchemaVersion,
      ),
      concurrency: saved.concurrency ?? 1,
    };
    validateSettings(settings);
    return settings;
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(settings: LLMSettings): void {
  validateSettings(settings);
  localStorage.setItem(
    storageKey,
    JSON.stringify({
      provider: settings.provider,
      model: settings.model.trim(),
      apiBase: settings.apiBase.trim(),
      tasks: settings.tasks,
      concurrency: settings.concurrency,
      taskSchemaVersion: 2,
    }),
  );
}

export function parseLLMResult(
  value: unknown,
  english = "",
  spanish = "",
): LLMResult {
  if (!value || typeof value !== "object")
    throw new Error("The LLM helper returned an invalid response.");
  const result = value as Record<string, unknown>;
  if (typeof result.error === "string") throw new Error(result.error);
  if (
    typeof result.model !== "string" ||
    !Array.isArray(result.findings) ||
    result.findings.length > 40
  )
    throw new Error("The LLM helper returned an invalid review.");
  const findings = result.findings.map(
    (item: Record<string, unknown>, index): Finding => {
      if (
        !item || typeof item !== "object" ||
        !["links", "structure", "content"].includes(String(item.kind)) ||
        !["warning", "info"].includes(String(item.severity)) ||
        !["en", "es"].includes(String(item.side))
      )
        throw new Error("The LLM returned an invalid finding category.");
      const lines = (item.side === "en" ? english : spanish).split("\n").length;
      if (
        !Number.isInteger(item.line) ||
        Number(item.line) < 1 ||
        Number(item.line) > lines ||
        typeof item.title !== "string" ||
        !item.title.trim() ||
        item.title.length > 160 ||
        typeof item.detail !== "string" ||
        !item.detail.trim() ||
        item.detail.length > 2000
      )
        throw new Error(
          "The LLM returned an invalid finding location or explanation.",
        );
      return {
        id: `llm-${index}`,
        kind: item.kind as Finding["kind"],
        severity: item.severity as Finding["severity"],
        side: item.side as Finding["side"],
        line: Number(item.line),
        title: item.title,
        detail: item.detail,
      };
    },
  );
  return {
    model: result.model,
    findings,
  };
}

export async function requestLLMReview(
  request: LLMRequest,
): Promise<LLMResult> {
  validateSettings(request.settings);
  if (request.task) validateTasks([request.task], 1);
  if (isTauri()) {
    const { reviewLLM } = await import("./llmReview.js");
    const environment = request.settings.apiKey || request.settings.provider === "ollama"
      ? {}
      : await invoke<Record<string, string>>("llm_environment", {
          provider: request.settings.provider,
        });
    return reviewLLM(request, {
      environment,
      fetch: async (input, init) => {
        const outgoing = new Request(input, init);
        outgoing.signal.throwIfAborted();
        const result = await invoke<{
          status: number;
          headers: Record<string, string>;
          body: string;
        }>("llm_fetch", {
          url: outgoing.url,
          provider: request.settings.provider,
          headers: Object.fromEntries(outgoing.headers),
          body: await outgoing.text(),
        });
        outgoing.signal.throwIfAborted();
        return new Response(result.body, {
          status: result.status,
          headers: result.headers,
        });
      },
    });
  }
  const response = await fetch("/api/llm/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(
      typeof error?.error === "string"
        ? error.error
        : `LLM service failed (${response.status}).`,
    );
  }
  return parseLLMResult(
    await response.json(),
    request.english,
    request.spanish,
  );
}

export type LLMReviewKey = {
  settings: LLMSettings;
  tasks: ReviewTask[];
  language: string;
  english: string;
  spanish: string;
  reviewComments?: { path: string; line: number | null; body: string }[];
};

async function reviewDigest({ settings, tasks, language, english, spanish, reviewComments = [] }: LLMReviewKey): Promise<string> {
  // API keys are excluded so stored reviews survive reloads, where keys are not persisted.
  const text = JSON.stringify([settings.provider, settings.model, settings.apiBase, tasks, language, english, spanish, reviewComments]);
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function loadLLMReview(key: LLMReviewKey): Promise<TaskRun[] | undefined> {
  try {
    return (await readCache<TaskRun[]>("llm-reviews", await reviewDigest(key)))?.value;
  } catch {
    return undefined;
  }
}

export async function saveLLMReview(key: LLMReviewKey, runs: TaskRun[]): Promise<void> {
  const succeeded = runs.filter((run) => run.status === "succeeded");
  if (!succeeded.length) return;
  try {
    await writeCache("llm-reviews", await reviewDigest(key), succeeded);
  } catch {
    // Persistence is best effort; the in-memory review remains available.
  }
}
