import assert from "node:assert/strict";
import test from "node:test";
import {
  alignSections,
  mapLine,
  parseDocument,
  reviewDocuments,
} from "../src/review";
import type { Workspace } from "../src/review";
import { sample } from "../src/sample";
import { defaultSettings, parseLLMResult, validateSettings } from "../src/llm";
import {
  defaultTasks,
  runReviewTasks,
  migrateReviewTasks,
  validateTasks,
} from "../src/reviewTasks";
import type { TaskRun } from "../src/reviewTasks";

test("historical review cases preserve Hugo anchors and heading helpers", () => {
  const result = review(
    '## Container probes {#container-probes}\n\n{{% heading "prerequisites" %}}',
    "## Sondas del contenedor\n\nAntes de comenzar.",
  );
  assert.ok(
    result.findings.some(
      (finding) =>
        finding.title === "Source anchor ID missing in translation" &&
        finding.line === 1,
    ),
  );
  assert.ok(
    result.findings.some(
      (finding) =>
        finding.title === "Hugo shortcode contract differs" &&
        finding.detail.includes("prerequisites"),
    ),
  );
});

test("translated glossary text is valid but glossary identifiers must be preserved", () => {
  const source = '{{< glossary_tooltip text="Pod" term_id="pod" >}}';
  const valid = review(
    source,
    '{{< glossary_tooltip text="Pod traducido" term_id="pod" >}}',
  );
  assert.ok(
    !valid.findings.some(
      (finding) => finding.title === "Hugo shortcode contract differs",
    ),
  );
  const invalid = review(
    source,
    '{{< glossary_tooltip text="Pod" term_id="contenedor" >}}',
  );
  assert.ok(
    invalid.findings.some(
      (finding) => finding.title === "Hugo shortcode contract differs",
    ),
  );
});

test("YAML syntax and rendering metadata differences are checked without copying reviewer lists", () => {
  const source =
    "---\ntitle: Source\ncontent_type: concept\nreviewers: [english-reviewer]\n---\n\n# Page";
  const broken = review(source, "---\ntitle: [Sin cierre\n---\n\n# Página");
  assert.ok(
    broken.findings.some(
      (finding) => finding.title === "Invalid YAML frontmatter",
    ),
  );
  const changed = review(
    source,
    "---\ntitle: Traducción\ncontent_type: task\nreviewers: [spanish-reviewer]\n---\n\n# Página",
  );
  assert.equal(
    changed.findings.filter(
      (finding) => finding.title === "Page metadata differs from source",
    ).length,
    1,
  );
  assert.ok(
    changed.findings.some((finding) => finding.detail.includes("content_type")),
  );
});

test("Hugo block closures are checked but examples and comments are ignored", () => {
  const source = "{{< note >}}\nA note.\n{{< /note >}}";
  const broken = review(source, "{{< note >}}\nUna nota.");
  assert.ok(
    broken.findings.some((finding) => finding.title === "Unclosed Hugo block"),
  );
  const example = review(
    "# Source",
    "# Página\n\n```md\n{{< note >}}\n```\n\n<!-- {{< warning >}} -->",
  );
  assert.ok(
    !example.findings.some((finding) => finding.title.includes("Hugo")),
  );
  const malformed = review(
    "# Source",
    '# Página\n\n{{% heading "prerequisites" >}}',
  );
  assert.ok(
    malformed.findings.some(
      (finding) => finding.title === "Hugo shortcode delimiter mismatch",
    ),
  );
});

test("adjacent duplicated translation paragraphs are identified", () => {
  const paragraph =
    "Las redes son una parte central de Kubernetes y permiten que las aplicaciones se comuniquen de forma segura dentro del clúster.";
  const result = review(
    "# Networking\n\nNetworking connects applications.",
    `# Redes\n\n${paragraph}\n\n${paragraph}`,
  );
  assert.ok(
    result.findings.some(
      (finding) =>
        finding.title === "Repeated adjacent paragraph" &&
        finding.side === "es" &&
        finding.line === 5,
    ),
  );
});

test("historical rubric migration preserves custom tasks and disabled choices", () => {
  const customized = [
    {
      id: "grammar",
      name: "My grammar task",
      enabled: false,
      instructions: "My custom instructions",
    },
  ];
  assert.deepEqual(migrateReviewTasks(customized, undefined), customized);
  assert.deepEqual(migrateReviewTasks([], 2), []);
  const grammar = defaultTasks.find((task) => task.id === "grammar")!;
  assert.match(grammar.instructions, /informal second-person tú/);
  assert.ok(defaultTasks.some((task) => task.id === "presentation"));
  const migrated = migrateReviewTasks(
    [
      {
        id: "grammar",
        name: "Spanish grammar",
        enabled: false,
        instructions:
          "Review Spanish spelling, accents, grammar, punctuation, and consistency of formal versus informal address. Focus on actionable language errors rather than subjective rewrites. Preserve technical names, commands, paths, and URLs.",
      },
    ],
    undefined,
  );
  assert.equal(migrated[0].instructions, grammar.instructions);
  assert.equal(migrated[0].enabled, false);
});
import { documentationUrl } from "../src/documentationUrl";
import {
  checkPublishedReferences,
  collectPublishedReferences,
  issueDraft,
  publishedFindings,
} from "../src/publishedReferences";
import type { PublishedReference } from "../src/publishedReferences";

test("published reference checks only accept Kubernetes documentation URLs", () => {
  assert.equal(
    documentationUrl("https://kubernetes.io/docs/concepts/?key=secret#pods")
      .href,
    "https://kubernetes.io/docs/concepts/",
  );
  assert.equal(
    documentationUrl("https://kubernetes.io/es/docs/").hostname,
    "kubernetes.io",
  );
  for (const url of [
    "https://evil.example/docs/",
    "https://kubernetes.io.evil.example/docs/",
    "https://secret@kubernetes.io/docs/",
    "http://kubernetes.io/docs/",
    "https://127.0.0.1/docs/",
    "https://kubernetes.io/blog/",
    "https://kubernetes.io/docs/../blog/",
    "https://kubernetes.io:444/docs/",
  ])
    assert.throws(() => documentationUrl(url));
});

test("published references resolve source-relative paths without checking other hosts or code samples", () => {
  const english = {
    path: "content/en/docs/concepts/page.md",
    content:
      "[Guide](/docs/tasks/)\n\n[Other](https://example.com/docs/)\n\n[Local](#heading)\n\n```md\n[Example](https://kubernetes.io/docs/missing/)\n```",
  };
  const spanish = {
    path: "content/es/docs/concepts/page.md",
    content:
      "[Guía](../tasks/)\n\n[Pods](https://kubernetes.io/docs/pods/#example)",
  };
  const references = collectPublishedReferences(english, spanish);
  assert.deepEqual(
    references.map((reference) => reference.url),
    [
      "https://kubernetes.io/docs/tasks/",
      "https://kubernetes.io/es/docs/concepts/tasks/",
      "https://kubernetes.io/docs/pods/#example",
    ],
  );
  assert.equal(references[0].line, 1);
  assert.equal(references[1].side, "es");
});

test("only confirmed missing published pages offer issue drafts", () => {
  const statuses = [200, 404, 410, 403, 429, 500];
  const references: PublishedReference[] = statuses.map((status, index) => ({
    url: `https://kubernetes.io/docs/test-${index}/`,
    original: `/docs/test-${index}/`,
    side: "es",
    line: 1,
  }));
  const document = {
    path: "content/es/docs/page.md",
    content: "[Guía](/docs/test-1/)",
  };
  const findings = publishedFindings(
    references,
    references.map((reference, index) => ({
      url: reference.url,
      status: statuses[index],
    })),
    document,
    document,
  );
  assert.equal(
    findings.filter((finding) => finding.severity === "error").length,
    2,
  );
  assert.equal(findings.filter((finding) => finding.issueUrl).length, 2);
  assert.equal(
    findings.filter((finding) => finding.severity === "info").length,
    3,
  );
  const failed = publishedFindings(
    [references[0]],
    [{ url: references[0].url, error: "Network timeout" }],
    document,
    document,
  );
  assert.equal(failed[0].issueUrl, undefined);
  assert.equal(failed[0].severity, "info");
});

test("GitHub issue drafts contain source location, PR context and HTTP evidence", () => {
  const reference: PublishedReference = {
    url: "https://kubernetes.io/docs/missing/",
    original: "/docs/missing/",
    side: "es",
    line: 3,
  };
  const draft = new URL(
    issueDraft(
      reference,
      {
        path: "content/es/docs/page.md",
        content: "# Página\n\n[Guía](/docs/missing/)",
      },
      {
        url: reference.url,
        finalUrl: reference.url,
        status: 404,
        checkedAt: "2026-10-23T00:00:00.000Z",
      },
      "https://github.com/kubernetes/website/pull/42",
    ),
  );
  assert.equal(
    draft.origin + draft.pathname,
    "https://github.com/kubernetes/website/issues/new",
  );
  assert.match(
    draft.searchParams.get("title")!,
    /Broken documentation reference/,
  );
  const body = draft.searchParams.get("body")!;
  for (const text of [
    "content/es/docs/page.md",
    "Source line: 3",
    "HTTP status: 404",
    "pull/42",
    "2026-10-23T00:00:00.000Z",
    "> [Guía](/docs/missing/)",
  ])
    assert.ok(body.includes(text));
});

test("published checks deduplicate page URLs and keep anchor checks separate", async (context) => {
  const requests: string[] = [];
  context.mock.method(
    globalThis,
    "fetch",
    async (_input: unknown, options: RequestInit) => {
      const { url } = JSON.parse(options.body as string);
      requests.push(url);
      return Response.json({ url, finalUrl: url, status: 200 });
    },
  );
  const references: PublishedReference[] = ["#first", "#second"].map(
    (anchor) => ({
      url: `https://kubernetes.io/docs/pods/${anchor}`,
      original: `/docs/pods/${anchor}`,
      side: "en",
      line: 1,
    }),
  );
  const results = await checkPublishedReferences(references);
  assert.equal(requests.length, 1);
  assert.equal(results.length, 1);
  assert.ok(results[0].checkedAt);
});

test("review tasks validate custom definitions and bounded parallel limits", () => {
  validateTasks(defaultTasks, 1);
  for (const concurrency of [0, 5, 1.5])
    assert.throws(() => validateTasks(defaultTasks, concurrency));
  assert.throws(() => validateTasks([defaultTasks[0], defaultTasks[0]], 1));
  assert.throws(() =>
    validateTasks([{ ...defaultTasks[0], instructions: "" }], 1),
  );
  assert.throws(() => validateTasks([{ ...defaultTasks[0], name: "" }], 1));
});

test("task runner respects concurrency, isolates failures and creates unique provenance", async () => {
  const tasks = defaultTasks.slice(0, 3);
  const gates = new Map<string, (fail?: boolean) => void>();
  const snapshots: TaskRun[][] = [];
  let active = 0;
  let peak = 0;
  const pending = runReviewTasks(
    tasks,
    2,
    (task) => {
      active++;
      peak = Math.max(peak, active);
      return new Promise((resolve, reject) =>
        gates.set(task.id, (fail = false) => {
          active--;
          if (fail) reject(new Error("Model unavailable"));
          else
            resolve({
              model: "ollama/test",
              findings: [
                {
                  id: "llm-0",
                  kind: "content",
                  severity: "warning",
                  side: "es",
                  line: 1,
                  title: "Check translation",
                  detail: "Review this phrase.",
                },
              ],
            });
        }),
      );
    },
    (runs) => snapshots.push(runs),
  );
  assert.equal(active, 2);
  assert.equal(gates.size, 2);
  gates.get(tasks[0].id)!();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(gates.size, 3);
  gates.get(tasks[1].id)!(true);
  gates.get(tasks[2].id)!();
  const runs = await pending;
  assert.equal(peak, 2);
  assert.deepEqual(
    runs.map((run) => run.status),
    ["succeeded", "failed", "succeeded"],
  );
  assert.equal(runs[1].error, "Model unavailable");
  assert.equal(runs[0].findings[0].taskName, tasks[0].name);
  assert.notEqual(runs[0].findings[0].id, runs[2].findings[0].id);
  assert.ok(
    snapshots.some(
      (runs) => runs[0].status === "succeeded" && runs[2].status === "running",
    ),
  );
});

test("disabled tasks do not send model requests", async () => {
  let calls = 0;
  const runs = await runReviewTasks(
    defaultTasks.map((task) => ({ ...task, enabled: false })),
    1,
    async () => {
      calls++;
      return { model: "test", findings: [] };
    },
  );
  assert.deepEqual(runs, []);
  assert.equal(calls, 0);
});

test("LLM defaults use Ollama and prevent credentials in endpoint URLs", () => {
  assert.equal(defaultSettings.provider, "ollama");
  assert.equal(defaultSettings.model, "llama3.2");
  validateSettings(defaultSettings);
  for (const apiBase of [
    "http://remote.example.invalid",
    "https://secret@example.invalid",
    "https://example.invalid?api_key=secret",
    "file:///tmp/model",
  ])
    assert.throws(() => validateSettings({ ...defaultSettings, apiBase }));
  assert.throws(() =>
    validateSettings({ ...defaultSettings, pythonExecutable: "sh" }),
  );
});

test("LLM findings are bounded and cannot claim verified errors or invalid lines", () => {
  const finding = {
    kind: "content",
    severity: "warning",
    side: "es",
    line: 1,
    title: "Translation",
    detail: "Check this phrase.",
  };
  const result = parseLLMResult(
    { model: "ollama/llama3.2", findings: [finding] },
    "Source",
    "Texto",
  );
  assert.equal(result.findings[0].id, "llm-0");
  for (const change of [
    { line: 2 },
    { line: true },
    { severity: "error" },
    { detail: "" },
  ])
    assert.throws(() =>
      parseLLMResult(
        { model: "test", findings: [{ ...finding, ...change }] },
        "Source",
        "Texto",
      ),
    );
  assert.throws(
    () => parseLLMResult({ error: "Model unavailable" }),
    /Model unavailable/,
  );
});

function review(
  en: string,
  es: string,
  complete = true,
  extra: Workspace["documents"] = [],
) {
  const english = { path: "content/en/docs/page.md", content: en };
  const spanish = { path: "content/es/docs/page.md", content: es };
  return reviewDocuments(english, spanish, {
    name: "test",
    complete,
    documents: [english, spanish, ...extra],
    paths: [],
  });
}

test("translated heading wording is not reported as a missing section", () => {
  const result = review(
    "## Upgrading control plane nodes\n\nUpgrade nodes.",
    "## Actualizar los nodos del plano de control\n\nActualiza los nodos.",
  );
  assert.equal(result.alignment.length, 1);
  assert.equal(result.alignment[0].confidence, "position");
  assert.equal(result.findings.length, 0);
});

test("explicit heading anchors align sections across an inserted heading", () => {
  const en = parseDocument(
    "## First {#first}\n\n## Extra {#extra}\n\n## Last {#last}",
  );
  const es = parseDocument("## Primero {#first}\n\n## Último {#last}");
  const alignment = alignSections(en.headings, es.headings);
  assert.deepEqual(
    alignment.map((pair) => [pair.en.key, pair.es.key]),
    [
      ["first", "first"],
      ["last", "last"],
    ],
  );
});

test("frontmatter is not interpreted as a heading or untranslated prose", () => {
  const result = parseDocument(
    "---\ntitle: Example\nweight: 10\n---\n\n## Overview\n\nText.",
  );
  assert.equal(result.headings.length, 1);
  assert.equal(result.headings[0].line, 6);
  assert.equal(result.paragraphs.length, 1);
});

test("known local references and duplicate heading anchors resolve", () => {
  const result = review(
    "# Page",
    "# Página\n\n## Uso\n\n## Uso\n\n[Segundo](#uso-1)\n\n[Pod](/docs/pods/#pods)",
    true,
    [{ path: "content/es/docs/pods.md", content: "# Pods" }],
  );
  assert.equal(
    result.findings.filter((finding) => finding.kind === "links").length,
    0,
  );
});

test("repository missing targets are errors; incomplete pairs are notes", () => {
  assert.equal(
    review("# Page", "# Página\n\n[Guía](/docs/missing/)").findings.find(
      (finding) => finding.kind === "links",
    )?.severity,
    "error",
  );
  assert.equal(
    review("# Page", "# Página\n\n[Guía](/docs/missing/)", false).findings.find(
      (finding) => finding.kind === "links",
    )?.severity,
    "info",
  );
});

test("reference-style Markdown links resolve through definitions", () => {
  const result = review(
    "# Page",
    "# Página\n\n[Uso][guide]\n\n[guide]: #página",
  );
  assert.equal(
    result.findings.filter((finding) => finding.kind === "links").length,
    0,
  );
});

test("undefined full reference links are reported", () => {
  assert.ok(
    review("# Page", "# Página\n\n[Guía][missing]").findings.some(
      (finding) => finding.title === "Undefined reference",
    ),
  );
});

test("Hugo relrefs resolve but shortcode samples inside code are ignored", () => {
  const content =
    '# Página\n\n{{< relref "pods.md" >}}\n\n```markdown\n{{< relref "missing.md" >}}\n```';
  const result = review("# Page", content, true, [
    { path: "content/es/docs/pods.md", content: "# Pods" },
  ]);
  assert.equal(
    result.findings.filter((finding) => finding.kind === "links").length,
    0,
  );
});

test("external URLs are not fetched or mislabeled as broken", () => {
  const result = review(
    "# Page",
    "# Página\n\n[Web](https://example.com)\n\n[Mail](mailto:docs@example.com)",
  );
  assert.equal(result.externalLinks, 2);
  assert.equal(
    result.findings.filter((finding) => finding.kind === "links").length,
    0,
  );
});

test("code differences retain exact source locations", () => {
  const result = review(
    "# Page\n\n```sh\nkubectl get pods\n```",
    "# Página\n\n```sh\nkubectl delete pods\n```",
  );
  const finding = result.findings.find(
    (finding) => finding.title === "Code sample differs",
  );
  assert.equal(finding?.line, 3);
  assert.equal(finding?.endLine, 5);
});

test("terminology in link destinations does not count as untranslated prose", () => {
  const result = review(
    "# Page\n\nRead about the [cluster](/docs/administer-cluster/) before you begin configuring your application.",
    "# Página\n\nLee sobre el [clúster](/docs/administer-cluster/) antes de comenzar a configurar tu aplicación.",
    false,
  );
  assert.ok(
    !result.findings.some(
      (finding) => finding.title === "Possibly untranslated paragraph",
    ),
  );
});

test("scroll mapping follows heading anchors and stays within document bounds", () => {
  const result = review(
    "## First {#first}\n\nA\n\n## Last {#last}",
    "## Primero {#first}\n\nA\n\nB\n\n## Último {#last}",
  );
  assert.equal(mapLine(5, result.alignment, "en", 5, 7), 7);
  assert.equal(mapLine(1, [], "en", 1, 1), 1);
});

test("example review detects intended issues with source locations", () => {
  const result = reviewDocuments(
    sample.documents[0],
    sample.documents[1],
    sample,
  );
  assert.equal(result.findings.length, 6);
  assert.equal(result.alignment.length, 5);
  const brokenReference = result.findings.find(
    (finding) => finding.title === "Broken internal reference",
  );
  assert.equal(brokenReference?.line, 32);
  assert.equal(brokenReference?.side, "es");
});
