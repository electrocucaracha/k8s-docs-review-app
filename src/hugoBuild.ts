import { invoke } from "@tauri-apps/api/core";
import { parseDocument } from "./review";
import type { Document, Finding } from "./review";

export type HugoLink = {
  href: string;
  text: string;
  status: "ok" | "missing" | "anchor" | "redirect" | "skipped";
  detail: string;
};
export type HugoPage = {
  path: string;
  route: string;
  rendered: boolean;
  links: HugoLink[];
};
export type HugoDiagnostic = {
  level: "error" | "warning";
  path?: string;
  line?: number;
  message: string;
};
export type HugoReport = {
  version: string;
  expectedVersion?: string;
  success: boolean;
  pages: HugoPage[];
  diagnostics: HugoDiagnostic[];
};

// Static link findings that a successful Hugo render replaces.
export const hugoSupersedes = new Set([
  "Broken internal reference",
  "Target not loaded",
  "Anchor not found",
  "Anchor not checked",
  "Dynamic link not checked",
]);

export function checkHugoBuild(paths: string[]): Promise<HugoReport> {
  return invoke<HugoReport>("check_hugo_links", { paths });
}

function linkKey(url: string, route: string) {
  try {
    const parsed = new URL(url, `https://kubernetes.io${route}`);
    if (parsed.host !== "kubernetes.io") return undefined;
    const path = decodeURIComponent(parsed.pathname)
      .toLowerCase()
      .replace(/\.md$/, "")
      .replace(/(^|\/)_?index$/, "")
      .replace(/\/+$/, "")
      .replace(/^\/(?!docs\/)[a-z]{2,3}(?:-[a-z]{2,4})?(?=\/)/, "");
    return {
      path,
      last: path.split("/").pop() ?? "",
      hash: decodeURIComponent(parsed.hash),
    };
  } catch {
    return undefined;
  }
}

/** Maps rendered links to Markdown lines, consuming repeated links in order. */
export function sourceLocator(document: Document, route: string) {
  const sources = parseDocument(document.content)
    .links.filter((link) => !link.reference)
    .map((link) => ({ line: link.line, key: linkKey(link.url, route) }));
  const lines = document.content.split("\n");
  const used = new Set<number>();
  const take = (index: number) => {
    if (index < 0) return undefined;
    used.add(index);
    return sources[index].line;
  };
  return (link: Pick<HugoLink, "href" | "text">): number | undefined => {
    const key = linkKey(link.href, route);
    if (key) {
      const exact = sources.findIndex(
        (source, index) =>
          !used.has(index) &&
          source.key?.path === key.path &&
          source.key.hash === key.hash,
      );
      if (exact >= 0) return take(exact);
      const similar = sources.findIndex(
        (source, index) =>
          !used.has(index) &&
          source.key?.last === key.last &&
          source.key.hash === key.hash,
      );
      if (similar >= 0) return take(similar);
    }
    if (link.text) {
      const index = lines.findIndex((line) => line.includes(`[${link.text}]`));
      if (index >= 0) return index + 1;
      const shortcode = lines.findIndex(
        (line) => line.includes("{{") && line.includes(`"${link.text}"`),
      );
      if (shortcode >= 0) return shortcode + 1;
    }
    const fragment = key?.hash;
    if (fragment) {
      const index = lines.findIndex((line) => line.includes(fragment));
      if (index >= 0) return index + 1;
    }
    return undefined;
  };
}

export function hugoFindings(
  report: HugoReport,
  english: Document,
  spanish: Document,
): Finding[] {
  const findings: Finding[] = [];
  const sideOf = (path?: string) => (path === english.path ? "en" : "es");
  const add = (finding: Omit<Finding, "id" | "kind">) =>
    findings.push({
      ...finding,
      kind: "links",
      id: `hugo-${finding.side}-${finding.line}-${findings.length}`,
    });
  for (const page of report.pages) {
    const side = sideOf(page.path);
    if (!page.rendered) {
      if (report.success)
        add({
          side,
          severity: "warning",
          line: 1,
          title: "Rendered page not found",
          detail: `Hugo did not generate ${page.route}. Custom url or slug front matter, drafts excluded by the site, and headless bundles are not mapped.`,
        });
      continue;
    }
    const locate = sourceLocator(side === "en" ? english : spanish, page.route);
    for (const link of page.links) {
      if (link.status === "skipped") continue;
      const line = locate(link);
      if (link.status === "ok") continue;
      const label = `${link.text ? `"${link.text}" → ` : ""}${link.href}`;
      const location = line
        ? ""
        : " The source line was not identified; the link may come from a shortcode or include.";
      add({
        side,
        severity: link.status === "redirect" ? "warning" : "error",
        line: line ?? 1,
        title:
          link.status === "missing"
            ? "Rendered link target missing"
            : link.status === "anchor"
              ? "Rendered anchor missing"
              : "Link relies on a redirect",
        detail: `${label}: ${link.detail}${location}`,
      });
    }
  }
  for (const diagnostic of report.diagnostics) {
    const reference = diagnostic.message.includes("REF_NOT_FOUND");
    add({
      side: sideOf(diagnostic.path),
      severity: reference ? "error" : diagnostic.level,
      line: diagnostic.line ?? 1,
      title: reference
        ? "Hugo reference not found"
        : diagnostic.level === "error"
          ? "Hugo build error"
          : "Hugo build warning",
      detail: diagnostic.message,
    });
  }
  if (!report.success)
    add({
      side: "es",
      severity: "error",
      line: 1,
      title: "Hugo build failed",
      detail: `${report.version} could not build the checkout. Rendered links were not checked.`,
    });
  return findings;
}
