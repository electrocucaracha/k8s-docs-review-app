import { parseDocument } from "./review";
import type { Document, Finding } from "./review";
import { documentationUrl } from "./documentationUrl";
import { invoke, isTauri } from "@tauri-apps/api/core";

export type PublishedReference = {
  url: string;
  side: "en" | "es";
  line: number;
  original: string;
};
export type PublishedResponse = {
  url: string;
  finalUrl?: string;
  status?: number;
  error?: string;
  checkedAt?: string;
};
export type PublishedFinding = Finding & { issueUrl?: string };

export function collectPublishedReferences(
  english: Document,
  spanish: Document,
): PublishedReference[] {
  const references: PublishedReference[] = [];
  for (const [side, document] of [
    ["en", english],
    ["es", spanish],
  ] as const) {
    const route = document.path
      .replace(/^content\/en\//, "/")
      .replace(/^content\/([^/]+)\//, "/$1/")
      .replace(/(?:_?index)?\.md$/, "/")
      .replace(/\/+/g, "/");
    for (const link of parseDocument(document.content).links) {
      if (link.reference || link.url.startsWith("#") || link.url.includes("{{"))
        continue;
      try {
        const url = new URL(link.url, `https://kubernetes.io${route}`);
        const anchor = url.hash;
        const normalized = documentationUrl(url.href);
        normalized.hash = anchor;
        references.push({
          side,
          line: link.line,
          original: link.url,
          url: normalized.href,
        });
      } catch {
        continue;
      }
    }
  }
  return references;
}

export function issueDraft(
  reference: PublishedReference,
  document: Document,
  result: PublishedResponse,
  pullRequest?: string,
): string {
  const excerpt = document.content.split("\n")[reference.line - 1] ?? "";
  const url = new URL("https://github.com/kubernetes/website/issues/new");
  url.searchParams.set(
    "title",
    `Broken documentation reference: ${reference.url}`.slice(0, 200),
  );
  url.searchParams.set(
    "body",
    [
      "### Broken documentation reference",
      "",
      `Reference: ${reference.url}`,
      `Original Markdown target: ${reference.original}`,
      `Source file: ${document.path}`,
      `Source line: ${reference.line}`,
      ...(pullRequest ? [`Review PR: ${pullRequest}`] : []),
      "",
      "### Verification",
      "",
      `Checked at: ${result.checkedAt ?? new Date().toISOString()}`,
      `HTTP status: ${result.status}`,
      `Final URL: ${result.finalUrl ?? result.url}`,
      "",
      "### Source excerpt",
      "",
      ...excerpt
        .slice(0, 600)
        .split("\n")
        .map((line) => `> ${line}`),
      "",
      "### Expected behavior",
      "",
      "The documentation reference should resolve to an existing page, or be updated to its replacement.",
      "",
      "This draft was generated from a deterministic published-site check. Please verify the reference before submitting.",
    ].join("\n"),
  );
  return url.href;
}

export async function checkPublishedReferences(
  references: PublishedReference[],
  onProgress: (done: number, total: number) => void = () => {},
): Promise<PublishedResponse[]> {
  const urls = [
    ...new Set(
      references.map((reference) => documentationUrl(reference.url).href),
    ),
  ];
  if (urls.length > 100)
    throw new Error(
      "Published reference checks are limited to 100 distinct pages per document pair.",
    );
  const results: PublishedResponse[] = [];
  let cursor = 0;
  onProgress(0, urls.length);
  async function worker() {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      try {
        let value: unknown;
        if (isTauri())
          value = await invoke("check_published_reference", { url });
        else {
          const response = await fetch("/api/references/check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
            signal: AbortSignal.timeout(30_000),
          });
          if (!response.ok)
            throw new Error(
              `Reference check service returned HTTP ${response.status}`,
            );
          value = await response.json();
        }
        if (!value || typeof value !== "object")
          throw new Error("Invalid reference-check response");
        const result = value as PublishedResponse;
        if (
          result.url !== url ||
          (result.status != null &&
            (!Number.isInteger(result.status) ||
              result.status < 100 ||
              result.status > 599))
        )
          throw new Error("Invalid reference-check response");
        if (result.finalUrl) documentationUrl(result.finalUrl);
        results.push({
          url,
          ...(result.finalUrl ? { finalUrl: result.finalUrl } : {}),
          ...(result.status ? { status: result.status } : {}),
          ...(typeof result.error === "string" ? { error: result.error } : {}),
          checkedAt: new Date().toISOString(),
        });
      } catch (cause) {
        results.push({
          url,
          error: cause instanceof Error ? cause.message : String(cause),
          checkedAt: new Date().toISOString(),
        });
      }
      onProgress(results.length, urls.length);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(4, urls.length) }, () => worker()),
  );
  return results;
}

export async function openIssueDraft(value: string): Promise<void> {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.pathname !== "/kubernetes/website/issues/new"
  )
    throw new Error("Only Kubernetes website issue drafts can be opened.");
  if (isTauri()) await invoke("open_issue_draft", { url: url.href });
  else window.open(url.href, "_blank", "noopener,noreferrer");
}

export function publishedFindings(
  references: PublishedReference[],
  responses: PublishedResponse[],
  english: Document,
  spanish: Document,
  pullRequest?: string,
): PublishedFinding[] {
  const byUrl = new Map(responses.map((result) => [result.url, result]));
  return references.flatMap((reference, index): PublishedFinding[] => {
    const page = documentationUrl(reference.url).href;
    const result = byUrl.get(page);
    if (!result) return [];
    if (result.status === 404 || result.status === 410)
      return [
        {
          id: `published-${index}`,
          kind: "links",
          severity: "error",
          side: reference.side,
          line: reference.line,
          title: "Published documentation page not found",
          detail: `${reference.url} returned HTTP ${result.status}.`,
          issueUrl: issueDraft(
            reference,
            reference.side === "en" ? english : spanish,
            result,
            pullRequest,
          ),
        },
      ];
    if (
      result.error ||
      !result.status ||
      result.status < 200 ||
      result.status >= 300
    )
      return [
        {
          id: `published-${index}`,
          kind: "links",
          severity: "info",
          side: reference.side,
          line: reference.line,
          title: "Published reference could not be verified",
          detail: `${reference.url}: ${result.error ?? `HTTP ${result.status}`}. This is not a confirmed broken link.`,
        },
      ];
    return [];
  });
}
