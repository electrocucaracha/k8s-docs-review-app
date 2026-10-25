import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Finding } from "./review.js";
import {
  defaultTasks,
  migrateReviewTasks,
  validateTasks,
} from "./reviewTasks.js";
import type { ReviewTask } from "./reviewTasks.js";
import type { TaskRun } from "./reviewTasks.js";
import { readCache, writeCache } from "./localCache.js";

export type Provider =
  "ollama" | "openai" | "anthropic" | "gemini" | "openai-compatible";
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
/** Zero-based, end-exclusive line ranges of one aligned document excerpt. */
export type Excerpt = {
  english: [number, number];
  spanish: [number, number];
  part: number;
  parts: number;
};
export type LLMRequest = {
  action: "review" | "test";
  settings: LLMSettings;
  english?: string;
  spanish?: string;
  language?: string;
  task?: ReviewTask;
  reviewComments?: { path: string; line: number | null; body: string }[];
  excerpt?: Excerpt;
};

// Roughly 3,000-4,000 tokens of document text per request.
export const excerptCharacterBudget = 12_000;
// Local models generate slowly and Ollama's default context is small.
export const localExcerptCharacterBudget = 6_000;

export function logLLM(entry: Record<string, unknown>): void {
  console.info("[llm]", JSON.stringify(entry));
}

function sectionStarts(lines: string[]): number[] {
  const starts = [0];
  let index = 0;
  if (lines[0]?.trim() === "---") {
    const close = lines.findIndex(
      (line, position) => position > 0 && line.trim() === "---",
    );
    index = close < 0 ? lines.length : close + 1;
  }
  let fence = "";
  for (; index < lines.length; index++) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(lines[index])?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length)
        fence = "";
    } else if (!fence && index > 0 && /^#{1,6}\s/.test(lines[index]))
      starts.push(index);
  }
  return starts;
}

/**
 * Splits a large document pair into heading-aligned excerpts so each request
 * stays small enough to finish before the provider deadline.
 */
export function planExcerpts(
  english: string,
  spanish: string,
  budget = excerptCharacterBudget,
): Excerpt[] {
  if ([...english].length + [...spanish].length <= budget) return [];
  const en = english.split("\n");
  const es = spanish.split("\n");
  const enStarts = sectionStarts(en);
  const esSections = sectionStarts(es);
  // Without matching heading counts, map English boundaries proportionally.
  const esStarts =
    esSections.length === enStarts.length
      ? esSections
      : enStarts.map((start) => Math.round((start * es.length) / en.length));
  const size = (lines: string[], [start, end]: [number, number]) =>
    lines.slice(start, end).reduce((total, line) => total + line.length + 1, 0);
  type Unit = { english: [number, number]; spanish: [number, number] };
  const units: Unit[] = [];
  enStarts.forEach((start, index) => {
    const english: [number, number] = [start, enStarts[index + 1] ?? en.length];
    const spanish: [number, number] = [
      esStarts[index],
      esStarts[index + 1] ?? es.length,
    ];
    const pieces = Math.max(
      1,
      Math.min(
        Math.max(english[1] - english[0], spanish[1] - spanish[0]),
        Math.ceil((size(en, english) + size(es, spanish)) / budget),
      ),
    );
    const at = ([from, to]: [number, number], piece: number) =>
      from + Math.round(((to - from) * piece) / pieces);
    for (let piece = 0; piece < pieces; piece++)
      units.push({
        english: [at(english, piece), at(english, piece + 1)],
        spanish: [at(spanish, piece), at(spanish, piece + 1)],
      });
  });
  const chunks: Unit[] = [];
  let used = 0;
  for (const unit of units) {
    const cost = size(en, unit.english) + size(es, unit.spanish);
    const last = chunks.at(-1);
    if (last && used + cost <= budget) {
      last.english[1] = unit.english[1];
      last.spanish[1] = unit.spanish[1];
      used += cost;
    } else {
      chunks.push({ english: [...unit.english], spanish: [...unit.spanish] });
      used = cost;
    }
  }
  return chunks.map((chunk, index) => ({
    ...chunk,
    part: index + 1,
    parts: chunks.length,
  }));
}

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
  if (
    typeof settings.model !== "string" ||
    !settings.model.trim() ||
    settings.model.length > 200
  )
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
        !item ||
        typeof item !== "object" ||
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

function halveExcerpt({ english, spanish, part, parts }: Excerpt): Excerpt[] {
  if (english[1] - english[0] < 2 && spanish[1] - spanish[0] < 2) return [];
  const middle = ([start, end]: [number, number]) =>
    start + Math.floor((end - start) / 2);
  const [en, es] = [middle(english), middle(spanish)];
  return [
    { english: [english[0], en], spanish: [spanish[0], es], part, parts },
    { english: [en, english[1]], spanish: [es, spanish[1]], part, parts },
  ];
}

/**
 * Reviews large documents excerpt by excerpt (map) and merges the findings
 * (reduce). Timed-out excerpts are halved and retried; excerpts that still
 * fail are reported instead of discarding the others.
 */
export async function requestLLMReview(
  request: LLMRequest,
): Promise<LLMResult> {
  if (request.action !== "review" || request.excerpt)
    return requestSingleReview(request);
  const english = request.english ?? "";
  const spanish = request.spanish ?? "";
  const planned = planExcerpts(
    english,
    spanish,
    request.settings.provider === "ollama"
      ? localExcerptCharacterBudget
      : excerptCharacterBudget,
  );
  const whole: Excerpt = {
    english: [0, english.split("\n").length],
    spanish: [0, spanish.split("\n").length],
    part: 1,
    parts: 1,
  };
  type Outcome = { excerpt: Excerpt; result?: LLMResult; error?: unknown };
  const review = async (
    excerpt: Excerpt | undefined,
    depth: number,
  ): Promise<Outcome[]> => {
    const target = excerpt ?? whole;
    try {
      const result = await requestSingleReview(
        excerpt ? { ...request, excerpt } : request,
      );
      return [{ excerpt: target, result }];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const halves =
        depth < 2 && /timed out/i.test(message) ? halveExcerpt(target) : [];
      if (!halves.length) return [{ excerpt: target, error }];
      logLLM({
        event: "llm.split",
        task: request.task?.id,
        excerpt: `${target.part}/${target.parts}`,
        englishLines: target.english,
        translationLines: target.spanish,
        depth: depth + 1,
        reason: message,
      });
      return (
        await Promise.all(halves.map((half) => review(half, depth + 1)))
      ).flat();
    }
  };
  const outcomes = (
    await Promise.all(
      (planned.length ? planned : [undefined]).map((excerpt) =>
        review(excerpt, 0),
      ),
    )
  ).flat();
  if (outcomes.length === 1 && outcomes[0].result) return outcomes[0].result;
  const findings: Finding[] = [];
  const skipped: Finding[] = [];
  let model = "";
  let failure: unknown;
  for (const { excerpt, result, error } of outcomes) {
    if (result) {
      model = result.model;
      findings.push(...result.findings);
    } else {
      failure ??= error;
      const [start, end] = excerpt.english;
      skipped.push({
        id: "",
        kind: "content",
        severity: "warning",
        side: "en",
        line: Math.max(1, Math.min(start + 1, whole.english[1])),
        title: "LLM review incomplete",
        detail: `Excerpt ${excerpt.part} of ${excerpt.parts} (English lines ${start + 1}-${end}, translation lines ${excerpt.spanish[0] + 1}-${excerpt.spanish[1]}) was not reviewed: ${error instanceof Error ? error.message : String(error)} Rerun this task to review it.`,
      });
    }
  }
  if (!model) throw failure;
  const seen = new Set<string>();
  const unique = findings.filter((finding) => {
    const key = `${finding.side}:${finding.line}:${finding.title.trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const kept = [
    ...unique.filter((finding) => finding.severity === "warning"),
    ...unique.filter((finding) => finding.severity !== "warning"),
  ].slice(0, 40 - skipped.length);
  return {
    model,
    findings: [
      ...skipped,
      ...unique.filter((finding) => kept.includes(finding)),
    ].map((finding, index) => ({ ...finding, id: `llm-${index}` })),
  };
}

// Shared across tasks and excerpts so in-flight requests never exceed the
// configured parallel limit (and the bridge's four-request cap).
let activeRequests = 0;
const waitingRequests: (() => void)[] = [];

async function requestSingleReview(request: LLMRequest): Promise<LLMResult> {
  validateSettings(request.settings);
  const queued = Date.now();
  while (activeRequests >= request.settings.concurrency)
    await new Promise<void>((resolve) => waitingRequests.push(resolve));
  if (Date.now() - queued >= 1_000)
    logLLM({
      event: "llm.queued",
      task: request.task?.id,
      excerpt: request.excerpt
        ? `${request.excerpt.part}/${request.excerpt.parts}`
        : undefined,
      waitedMs: Date.now() - queued,
    });
  activeRequests++;
  try {
    return await sendReview(request);
  } finally {
    activeRequests--;
    waitingRequests.shift()?.();
  }
}

async function sendReview(request: LLMRequest): Promise<LLMResult> {
  if (request.task) validateTasks([request.task], 1);
  if (isTauri()) {
    const { reviewLLM } = await import("./llmReview.js");
    const environment =
      request.settings.apiKey || request.settings.provider === "ollama"
        ? {}
        : await invoke<Record<string, string>>("llm_environment", {
            provider: request.settings.provider,
          });
    return reviewLLM(request, {
      environment,
      log: logLLM,
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

async function reviewDigest({
  settings,
  tasks,
  language,
  english,
  spanish,
  reviewComments = [],
}: LLMReviewKey): Promise<string> {
  // API keys are excluded so stored reviews survive reloads, where keys are not persisted.
  const text = JSON.stringify([
    settings.provider,
    settings.model,
    settings.apiBase,
    tasks,
    language,
    english,
    spanish,
    reviewComments,
  ]);
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export async function loadLLMReview(
  key: LLMReviewKey,
): Promise<TaskRun[] | undefined> {
  try {
    return (await readCache<TaskRun[]>("llm-reviews", await reviewDigest(key)))
      ?.value;
  } catch {
    return undefined;
  }
}

export async function saveLLMReview(
  key: LLMReviewKey,
  runs: TaskRun[],
): Promise<void> {
  const succeeded = runs.filter((run) => run.status === "succeeded");
  if (!succeeded.length) return;
  try {
    await writeCache("llm-reviews", await reviewDigest(key), succeeded);
  } catch {
    // Persistence is best effort; the in-memory review remains available.
  }
}
