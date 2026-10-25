import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import { visit } from "unist-util-visit";
import { toString } from "mdast-util-to-string";
import GithubSlugger from "github-slugger";
import type { Root } from "mdast";
import { editorialChecks } from "./editorialChecks";

export type Document = { path: string; content: string };
export type Workspace = {
  name: string;
  documents: Document[];
  paths: string[];
  complete: boolean;
  native?: boolean;
};
export type Finding = {
  id: string;
  kind: "links" | "structure" | "content";
  severity: "error" | "warning" | "info";
  side: "en" | "es";
  line: number;
  endLine?: number;
  title: string;
  detail: string;
};
export type Block = { line: number; endLine: number; text: string };
export type Section = Block & { depth: number; key: string };
export type Alignment = {
  en: Section;
  es: Section;
  confidence: "anchor" | "position";
};
type Link = { url: string; line: number; reference?: boolean };
export type Parsed = {
  headings: Section[];
  paragraphs: Block[];
  codes: Block[];
  links: Link[];
  anchors: Set<string>;
  frontmatter?: Block;
  shortcodes: (Block & {
    name: string;
    signature: string;
    closing: boolean;
    balancedDelimiter: boolean;
  })[];
};
export type Review = {
  findings: Finding[];
  alignment: Alignment[];
  english: Parsed;
  spanish: Parsed;
  externalLinks: number;
};

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkFrontmatter, ["yaml", "toml"]);
const parsedCache = new Map<string, { content: string; parsed: Parsed }>();
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export function parseDocument(content: string): Parsed {
  const tree = processor.parse(content) as Root;
  const headings: Section[] = [];
  const paragraphs: Block[] = [];
  const codes: Block[] = [];
  const links: Link[] = [];
  const anchors = new Set<string>();
  const definitions = new Map<string, string>();
  const slugger = new GithubSlugger();
  const excluded: [number, number][] = [];
  let frontmatter: Block | undefined;
  const shortcodes: Parsed["shortcodes"] = [];
  visit(tree, (node) => {
    if (node.type === "definition")
      definitions.set(normalize(node.identifier), node.url);
    if (["code", "inlineCode", "yaml", "toml"].includes(node.type)) {
      if (node.position)
        excluded.push([
          node.position.start.offset ?? 0,
          node.position.end.offset ?? 0,
        ]);
    }
    if (
      node.type === "html" &&
      node.value.trimStart().startsWith("<!--") &&
      node.position
    )
      excluded.push([
        node.position.start.offset ?? 0,
        node.position.end.offset ?? 0,
      ]);
  });
  visit(tree, (node) => {
    const line = node.position?.start.line ?? 1;
    const endLine = node.position?.end.line ?? line;
    if (node.type === "yaml")
      frontmatter = { line: line + 1, endLine: endLine - 1, text: node.value };
    if (node.type === "heading") {
      const raw = toString(node);
      const explicit = raw.match(/\s*\{#([^}]+)\}\s*$/);
      const text = raw.replace(/\s*\{#[^}]+\}\s*$/, "");
      const key = explicit?.[1] ?? "";
      anchors.add(key || slugger.slug(text));
      headings.push({ line, endLine, text, depth: node.depth, key });
    }
    if (node.type === "paragraph") {
      const text = toString(node);
      if (text.trim() && !/^\s*\{\{[<%]/.test(text))
        paragraphs.push({ line, endLine, text });
    }
    if (node.type === "code")
      codes.push({ line, endLine, text: node.value.trim() });
    if (node.type === "link" || node.type === "image")
      links.push({ url: node.url, line });
    if (node.type === "linkReference" || node.type === "imageReference") {
      const url = definitions.get(normalize(node.identifier));
      links.push({ url: url ?? node.identifier, line, reference: !url });
    }
    if (node.type === "text" && node.position) {
      const offset = node.position.start.offset ?? 0;
      const raw = content.slice(offset, node.position.end.offset);
      for (const match of raw.matchAll(/!?\[([^\]\n]+)\]\[([^\]\n]*)\]/g)) {
        if (raw[match.index - 1] === "\\") continue;
        const identifier = match[2] || match[1];
        if (!definitions.has(normalize(identifier)))
          links.push({
            url: identifier,
            line: line + raw.slice(0, match.index).split("\n").length - 1,
            reference: true,
          });
      }
    }
    if (node.type === "html") {
      for (const match of node.value.matchAll(
        /\b(?:id|name)=["']([^"']+)["']/g,
      ))
        anchors.add(match[1]);
    }
  });
  for (const match of content.matchAll(
    /\{\{[<%]\s*(?:relref|ref)\s+["']([^"']+)["']\s*[%>]\}\}/g,
  )) {
    if (
      excluded.some(([start, end]) => match.index >= start && match.index < end)
    )
      continue;
    links.push({
      url: match[1],
      line: content.slice(0, match.index).split("\n").length,
    });
  }
  for (const match of content.matchAll(
    /\{\{([<%])\s*(\/?[\w-]+)\b([\s\S]*?)([>%])\}\}/g,
  )) {
    if (
      excluded.some(([start, end]) => match.index >= start && match.index < end)
    )
      continue;
    const name = match[2].replace(/^\//, "");
    const attributes = [
      ...match[3].matchAll(/\b(term_id|file|codelang)\s*=\s*["']([^"']*)["']/g),
    ]
      .map((attribute) => `${attribute[1]}=${attribute[2]}`)
      .sort();
    const positional = [
      "heading",
      "include",
      "readfile",
      "code_sample",
    ].includes(name)
      ? match[3].trim().match(/^["']([^"']+)["']/)?.[1]
      : undefined;
    const line = content.slice(0, match.index).split("\n").length;
    shortcodes.push({
      name,
      signature: [
        name,
        ...attributes,
        ...(positional ? [positional] : []),
      ].join(" "),
      closing: match[2].startsWith("/"),
      balancedDelimiter:
        (match[1] === "<" && match[4] === ">") ||
        (match[1] === "%" && match[4] === "%"),
      line,
      endLine: line + match[0].split("\n").length - 1,
      text: match[0],
    });
  }
  return {
    headings,
    paragraphs,
    codes,
    links,
    anchors,
    frontmatter,
    shortcodes,
  };
}

function parsed(document: Document): Parsed {
  const cached = parsedCache.get(document.path);
  if (cached?.content === document.content) return cached.parsed;
  const result = parseDocument(document.content);
  if (parsedCache.size > 300) parsedCache.clear();
  parsedCache.set(document.path, { content: document.content, parsed: result });
  return result;
}

export function normalizePath(path: string): string {
  const segments: string[] = [];
  for (const segment of path.replace(/\\/g, "/").split("/")) {
    if (segment === "..") segments.pop();
    else if (segment && segment !== ".") segments.push(segment);
  }
  return segments.join("/");
}

export function pairPath(path: string): string {
  return path.replace(/^content\/[^/]+\//, "content/en/");
}

function signature(section: Section): string {
  if (section.key) return `id:${section.key}`;
  const technical = section.text.match(/`[^`]+`/g);
  if (technical) return `code:${technical.join(" ")}`;
  return `text:${normalize(section.text)}`;
}

export function alignSections(
  english: Section[],
  spanish: Section[],
): Alignment[] {
  const alignment: Alignment[] = [];
  let enStart = 0;
  let esStart = 0;
  const fill = (enEnd: number, esEnd: number) => {
    const enGap = english.slice(enStart, enEnd);
    const esGap = spanish.slice(esStart, esEnd);
    if (enGap.length !== esGap.length) return;
    enGap.forEach((section, index) => {
      if (section.depth === esGap[index].depth)
        alignment.push({
          en: section,
          es: esGap[index],
          confidence: "position",
        });
    });
  };
  for (let enIndex = 0; enIndex < english.length; enIndex++) {
    const key = signature(english[enIndex]);
    const esIndex = spanish.findIndex(
      (section, index) =>
        index >= esStart &&
        signature(section) === key &&
        section.depth === english[enIndex].depth,
    );
    if (esIndex < 0) continue;
    fill(enIndex, esIndex);
    alignment.push({
      en: english[enIndex],
      es: spanish[esIndex],
      confidence: "anchor",
    });
    enStart = enIndex + 1;
    esStart = esIndex + 1;
  }
  fill(english.length, spanish.length);
  return alignment.sort((first, second) => first.en.line - second.en.line);
}

export function mapLine(
  line: number,
  alignment: Alignment[],
  from: "en" | "es",
  sourceLines: number,
  targetLines: number,
): number {
  const to = from === "en" ? "es" : "en";
  const points = [
    { source: 1, target: 1 },
    ...alignment.map((pair) => ({
      source: pair[from].line,
      target: pair[to].line,
    })),
    { source: sourceLines, target: targetLines },
  ];
  const before = points.findLast((point) => point.source <= line) ?? points[0];
  const after =
    points.find((point) => point.source > line) ?? points[points.length - 1];
  const ratio =
    after.source === before.source
      ? 0
      : (line - before.source) / (after.source - before.source);
  return Math.max(
    1,
    Math.min(
      targetLines,
      Math.round(before.target + ratio * (after.target - before.target)),
    ),
  );
}

function resolveLink(
  url: string,
  document: Document,
  documents: Map<string, Document>,
  paths: Set<string>,
): { target?: Document; anchor: string; exists: boolean; dynamic: boolean } {
  let decoded: string;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    decoded = url;
  }
  const [rawPath, anchor = ""] = decoded.split("#", 2);
  const clean = rawPath.split("?")[0];
  if (!clean) return { target: document, anchor, exists: true, dynamic: false };
  if (clean.includes("{{")) return { anchor, exists: false, dynamic: true };
  const locale = document.path.split("/")[1] ?? "en";
  const directory = document.path.substring(0, document.path.lastIndexOf("/"));
  let bases: string[];
  if (clean.startsWith("/")) {
    const relative = clean.replace(/^\//, "");
    bases = /^[a-z]{2,3}(?:-[a-z]{2,4})?\//.test(relative)
      ? [`content/${relative}`]
      : [
          `content/${locale}/${relative}`,
          `content/en/${relative}`,
          `static/${relative}`,
        ];
  } else {
    const page = document.path.replace(/(?:_?index)?\.md$/, "");
    bases = [
      `${directory}/${clean}`,
      `${page}/${clean}`,
      `content/${locale}/${clean}`,
      `content/en/${clean}`,
    ];
  }
  for (const base of bases) {
    const path = normalizePath(base).replace(/\/$/, "");
    for (const candidate of [
      path,
      `${path}.md`,
      `${path}/index.md`,
      `${path}/_index.md`,
    ]) {
      if (paths.has(candidate) || documents.has(candidate))
        return {
          target: documents.get(candidate),
          anchor,
          exists: true,
          dynamic: false,
        };
    }
  }
  return { anchor, exists: false, dynamic: false };
}

export function reviewDocuments(
  english: Document,
  spanish: Document,
  workspace: Workspace,
): Review {
  const en = parsed(english);
  const es = parsed(spanish);
  const documents = new Map(
    workspace.documents.map((document) => [document.path, document]),
  );
  documents.set(english.path, english);
  documents.set(spanish.path, spanish);
  const paths = new Set(workspace.paths);
  const findings: Finding[] = [];
  if (spanish.path.startsWith("content/es/")) findings.push(...editorialChecks(en, es));
  const add = (finding: Omit<Finding, "id">) =>
    findings.push({
      ...finding,
      id: `${finding.side}-${finding.kind}-${finding.line}-${findings.length}`,
    }    );
    const alignment = alignSections(en.headings, es.headings);
    let externalLinks = 0;
  for (const [side, document, analysis] of [
    ["en", english, en],
    ["es", spanish, es],
  ] as const) {
    for (const link of analysis.links) {
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(link.url)) {
        externalLinks++;
        continue;
      }
      if (link.reference) {
        add({
          side,
          kind: "links",
          severity: "error",
          line: link.line,
          title: "Undefined reference",
          detail: `No Markdown definition found for [${link.url}].`,
        });
        continue;
      }
      const result = resolveLink(link.url, document, documents, paths);
      if (result.dynamic) {
        add({
          side,
          kind: "links",
          severity: "info",
          line: link.line,
          title: "Dynamic link not checked",
          detail: `${link.url} requires Hugo rendering.`,
        });
      } else if (!result.exists) {
        add({
          side,
          kind: "links",
          severity: workspace.complete ? "error" : "info",
          line: link.line,
          title: workspace.complete
            ? "Broken internal reference"
            : "Target not loaded",
          detail: `${link.url} was not found${workspace.complete ? " in this repository" : ". Open a full repository to verify it"}.`,
        });
      } else if (
        result.anchor &&
        result.target &&
        !parsed(result.target).anchors.has(result.anchor)
      ) {
        add({
          side,
          kind: "links",
          severity: "warning",
          line: link.line,
          title: "Anchor not found",
          detail: `#${result.anchor} is not a heading or explicit ID in ${result.target.path}. Hugo-generated IDs may need manual verification.`,
        });
      } else if (result.anchor && !result.target) {
        add({
          side,
          kind: "links",
          severity: "info",
          line: link.line,
          title: "Anchor not checked",
          detail: `${link.url} points to a target without loaded Markdown.`,
        });
      }
    }
  }
  if (en.headings.length !== es.headings.length) {
    add({
      side: "es",
      kind: "structure",
      severity: "warning",
      line: 1,
      title: "Heading count differs",
      detail: `English has ${en.headings.length} headings; Spanish has ${es.headings.length}. Check for missing or combined sections. Translated heading wording is not treated as a missing section.`,
    });
  }
  for (const pair of alignment) {
    const enIndex = en.headings.indexOf(pair.en);
    const esIndex = es.headings.indexOf(pair.es);
    const enEnd = en.headings[enIndex + 1]?.line ?? Infinity;
    const esEnd = es.headings[esIndex + 1]?.line ?? Infinity;
    const enParagraphs = en.paragraphs.filter(
      (block) => block.line > pair.en.line && block.line < enEnd,
    );
    const esParagraphs = es.paragraphs.filter(
      (block) => block.line > pair.es.line && block.line < esEnd,
    );
    if (Math.abs(enParagraphs.length - esParagraphs.length) > 0) {
      add({
        side: "es",
        kind: "structure",
        severity: "info",
        line: pair.es.line,
        title: "Paragraph count differs",
        detail: `This section has ${enParagraphs.length} English and ${esParagraphs.length} Spanish paragraphs. Splitting or merging paragraphs can be valid.${pair.confidence === "position" ? " Section pairing is positional, not semantically verified." : ""}`,
      });
    }
  }
  const usedCode = new Set<number>();
  es.codes.forEach((block) => {
    const matchingIndex = en.codes.findIndex(
      (source, index) => source.text === block.text && !usedCode.has(index),
    );
    if (matchingIndex >= 0) usedCode.add(matchingIndex);
    else
      add({
        side: "es",
        kind: "content",
        severity: "warning",
        line: block.line,
        endLine: block.endLine,
        title: "Code sample differs",
        detail:
          "This fenced code block has no identical English counterpart. Verify commands, flags, and values; translated comments or output may be intentional.",
      });
  });
  en.codes.forEach((block, index) => {
    if (!usedCode.has(index))
      add({
        side: "en",
        kind: "content",
        severity: "info",
        line: block.line,
        endLine: block.endLine,
        title: "Source code sample unmatched",
        detail:
          "No identical Spanish code block was found. It may be missing or intentionally localized.",
      });
  });
  const sourceProse = new Set(
    en.paragraphs.map((block) => normalize(block.text)),
  );
  for (const block of es.paragraphs) {
    if (block.text.length > 70 && sourceProse.has(normalize(block.text))) {
      add({
        side: "es",
        kind: "content",
        severity: "warning",
        line: block.line,
        endLine: block.endLine,
        title: "Possibly untranslated paragraph",
        detail:
          "Visible prose matches English exactly. Technical names and link destinations alone do not trigger this check.",
      });
    }
  }
  const priority = { error: 0, warning: 1, info: 2 };
  findings.sort(
    (first, second) =>
      priority[first.severity] - priority[second.severity] ||
      first.line - second.line,
  );
  return {
    findings,
    alignment,
    english: en,
    spanish: es,
    externalLinks,
  };
}
