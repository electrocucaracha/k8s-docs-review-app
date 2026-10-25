import { LineCounter, parseDocument as parseYaml } from "yaml";
import type { Finding, Parsed } from "./review";

export function editorialChecks(source: Parsed, translated: Parsed): Finding[] {
  const findings: Finding[] = [];
  const add = (finding: Omit<Finding, "id">) =>
    findings.push({ ...finding, id: `editorial-${findings.length}` });
  const metadata = (
    parsed: Parsed,
    report: boolean,
  ): Record<string, unknown> | undefined => {
    if (!parsed.frontmatter) return;
    const counter = new LineCounter();
    try {
      const yaml = parseYaml(parsed.frontmatter.text, { lineCounter: counter });
      if (yaml.errors.length) {
        if (report)
          for (const error of yaml.errors.slice(0, 5))
            add({
              kind: "structure",
              severity: "error",
              side: "es",
              line:
                parsed.frontmatter.line +
                counter.linePos(error.pos[0]).line -
                1,
              title: "Invalid YAML frontmatter",
              detail: error.message.split("\n")[0],
            });
        return;
      }
      const value = yaml.toJS({ maxAliasCount: 20 });
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        if (report)
          add({
            kind: "structure",
            severity: "error",
            side: "es",
            line: parsed.frontmatter.line,
            title: "Invalid frontmatter mapping",
            detail: "Page frontmatter must contain named metadata fields.",
          });
        return;
      }
      return value as Record<string, unknown>;
    } catch {
      if (report)
        add({
          kind: "structure",
          severity: "error",
          side: "es",
          line: parsed.frontmatter.line,
          title: "Invalid YAML frontmatter",
          detail:
            "Metadata could not be parsed safely. Check YAML aliases and syntax.",
        });
    }
  };
  const enMetadata = metadata(source, false);
  const esMetadata = metadata(translated, true);
  if (enMetadata && esMetadata) {
    for (const key of [
      "content_type",
      "type",
      "layout",
      "weight",
      "toc-hide",
      "toc_hide",
    ]) {
      if (
        JSON.stringify(enMetadata[key]) !== JSON.stringify(esMetadata[key]) &&
        (Object.hasOwn(enMetadata, key) || Object.hasOwn(esMetadata, key))
      )
        add({
          kind: "structure",
          severity: "info",
          side: "es",
          line: translated.frontmatter!.line,
          title: "Page metadata differs from source",
          detail: `${key} differs between English and Spanish. Confirm this navigation or rendering change is intentional; translated titles, descriptions, and local reviewer lists may legitimately differ.`,
        });
    }
  }
  for (const heading of source.headings) {
    if (heading.key && !translated.anchors.has(heading.key))
      add({
        kind: "links",
        severity: "warning",
        side: "en",
        line: heading.line,
        title: "Source anchor ID missing in translation",
        detail: `The Spanish document does not define {#${heading.key}}. Preserve the source ID or verify incoming links when localizing it; translated heading wording alone does not preserve an explicit ID.`,
      });
  }
  const contracts = new Map<string, number>();
  for (const shortcode of translated.shortcodes)
    if (!shortcode.closing)
      contracts.set(
        shortcode.signature,
        (contracts.get(shortcode.signature) ?? 0) + 1,
      );
  for (const shortcode of source.shortcodes) {
    if (
      shortcode.closing ||
      ![
        "heading",
        "glossary_tooltip",
        "include",
        "readfile",
        "code_sample",
      ].includes(shortcode.name)
    )
      continue;
    const remaining = contracts.get(shortcode.signature) ?? 0;
    if (remaining) contracts.set(shortcode.signature, remaining - 1);
    else
      add({
        kind: "structure",
        severity: "warning",
        side: "en",
        line: shortcode.line,
        title: "Hugo shortcode contract differs",
        detail: `The Spanish document has no matching ${shortcode.signature}. Preserve heading keys, glossary term_id values, and included file references; visible text can be translated.`,
      });
  }
  const blockNames = new Set([
    "note",
    "warning",
    "caution",
    ...source.shortcodes
      .filter((shortcode) => shortcode.closing)
      .map((shortcode) => shortcode.name),
    ...translated.shortcodes
      .filter((shortcode) => shortcode.closing)
      .map((shortcode) => shortcode.name),
  ]);
  const stack: Parsed["shortcodes"] = [];
  for (const shortcode of translated.shortcodes) {
    if (!shortcode.balancedDelimiter)
      add({
        kind: "structure",
        severity: "warning",
        side: "es",
        line: shortcode.line,
        title: "Hugo shortcode delimiter mismatch",
        detail:
          "The opening and closing shortcode delimiters must both use angle brackets or both use percent signs.",
      });
    if (!blockNames.has(shortcode.name)) continue;
    if (!shortcode.closing) stack.push(shortcode);
    else if (stack.at(-1)?.name === shortcode.name) stack.pop();
    else
      add({
        kind: "structure",
        severity: "warning",
        side: "es",
        line: shortcode.line,
        title: "Unmatched Hugo block closing tag",
        detail: `The closing ${shortcode.name} shortcode does not match the currently open block.`,
      });
  }
  for (const shortcode of stack)
    add({
      kind: "structure",
      severity: "warning",
      side: "es",
      line: shortcode.line,
      title: "Unclosed Hugo block",
      detail: `No matching closing shortcode was found for ${shortcode.name}. Verify the rendered Hugo page.`,
    });
  for (let index = 1; index < translated.paragraphs.length; index++) {
    const current = translated.paragraphs[index];
    const previous = translated.paragraphs[index - 1];
    const normalize = (value: string) =>
      value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    if (
      current.text.length > 80 &&
      normalize(current.text) === normalize(previous.text)
    )
      add({
        kind: "content",
        severity: "warning",
        side: "es",
        line: current.line,
        endLine: current.endLine,
        title: "Repeated adjacent paragraph",
        detail:
          "This paragraph repeats the preceding visible paragraph. Check for accidentally duplicated translation content.",
      });
  }
  return findings;
}
