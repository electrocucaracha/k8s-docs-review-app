import type { Finding } from "./review.js";

export type ReviewTask = {
  id: string;
  name: string;
  instructions: string;
  enabled: boolean;
};
export type TaskFinding = Finding & { taskId: string; taskName: string };
export type TaskRun = {
  taskId: string;
  taskName: string;
  status: "queued" | "running" | "succeeded" | "failed";
  findings: TaskFinding[];
  model?: string;
  error?: string;
};

export const defaultTasks: ReviewTask[] = [
  {
    id: "accuracy",
    name: "Translation accuracy",
    enabled: true,
    instructions:
      "Review translation accuracy and changes in meaning between the English source and Spanish translation. Identify mistranslations, misleading phrasing, literal English calques, incorrect negation, and altered conditions. Prefer clear, natural Spanish without unnecessarily rare wording. Preserve technical meaning rather than translating word by word. Do not flag a legitimate regional synonym or subjective rewrite as an error. Do not report grammar, style, or missing sections unless they change the meaning.",
  },
  {
    id: "completeness",
    name: "Content completeness",
    enabled: true,
    instructions:
      "Review missing, duplicated, added, reordered, or untranslated content, including lists, prerequisites, warnings, links' visible labels, titles, descriptions, and tables. Use shared technical anchors to assess paragraph order; do not guess when prose lacks an anchor. Account for valid paraphrasing and merged or split paragraphs. Translated headings are not evidence of missing sections. Compare the supplied English revision, not remembered documentation or a different release. Flag changed deprecation or version caveats when supported by the source. Report omissions using English locations when there is no corresponding Spanish location.",
  },
  {
    id: "grammar",
    name: "Spanish grammar",
    enabled: true,
    instructions:
      "Review Spanish spelling, accents, grammar, agreement, articles, prepositions, punctuation, opening question/exclamation marks, and capitalization. Kubernetes Spanish reviewers consistently request the informal second-person tú: prefer consulta, ejecuta, puedes, tu clúster over consulte, ejecute, puede usted, su clúster when addressing the reader. Do not confuse possessive tu with pronoun tú or adjective solo with arbitrary accent rules. Avoid switching to impersonal or first-person plural instructions. Use neutral, readable Spanish and actionable corrections rather than subjective rewrites. Preserve technical names, commands, paths, URLs, quoted examples, and official English titles.",
  },
  {
    id: "terminology",
    name: "Terminology",
    enabled: true,
    instructions:
      "Review consistent Spanish Kubernetes terminology across the document. Distinguish an API object from a generic concept: preserve exact source spelling and case for Service, Pod, Namespace, IngressClass, ConfigMap, EndpointSlice and other API kinds, fields, flags, enum values and identifiers; servicio or contenedor can be correct generic prose. Prefer current source-backed control-plane wording over obsolete master terminology. Review runtime, endpoint, lease and workload translations in context rather than enforcing an unsupported glossary. Preserve glossary_tooltip term_id values while translating visible text when appropriate. Keep names, code and URL slugs unchanged unless the source or an existing localized target supports the change. Treat regional preferences or conflicting historical suggestions as suggestions, not universal errors.",
  },
  {
    id: "technical",
    name: "Technical fidelity",
    enabled: true,
    instructions:
      "Review changes to technical instructions, code samples, inline code, commands, flags, values, paths and API identifiers. Identify changed capitalization, removed arguments, altered resource relationships, versions, deprecation warnings or security meaning using the English source as evidence. Translated comments and sample output can be intentional, but executable identifiers and enum values must remain exact. Check that localized link labels do not silently change destinations, and preserve explicit source anchors or flag required incoming-link verification. Do not claim a remote link is broken without deterministic HTTP evidence. Do not introduce Kubernetes facts unsupported by the supplied source.",
  },
  {
    id: "presentation",
    name: "Markdown and metadata",
    enabled: true,
    instructions:
      "Review YAML frontmatter, translated page titles/descriptions, heading hierarchy, Markdown emphasis and inline-code delimiters, nested lists, tables, fenced-code language tags and indentation, and Hugo shortcode structure. Preserve heading helper keys such as prerequisites/whatsnext, explicit anchor IDs, glossary term_id values, include filenames and rendering metadata unless an intentional localization change is evidenced. Local reviewer lists may differ from English. Avoid recommending universal title case merely because an old review preferred it; follow the supplied source and current consistent style. Identify misplaced or unclosed note/warning blocks and missing prerequisite headings. Do not claim a page renders or a Hugo build passes: require rendered preview and matching head revision as manual verification.",
  },
];

const legacyInstructions: Record<string, string> = {
  accuracy:
    "Review translation accuracy and changes in meaning between the English source and Spanish translation. Identify mistranslations, misleading phrasing, and incorrect interpretations. Do not report grammar, style, or missing sections unless they change the meaning.",
  completeness:
    "Review missing, duplicated, added, or untranslated content. Account for valid paraphrasing and merged or split paragraphs. Translated headings are not evidence of missing sections. Report omissions using English locations when there is no corresponding Spanish location.",
  grammar:
    "Review Spanish spelling, accents, grammar, punctuation, and consistency of formal versus informal address. Focus on actionable language errors rather than subjective rewrites. Preserve technical names, commands, paths, and URLs.",
  terminology:
    "Review consistent Spanish Kubernetes terminology across the document. Identify contradictory translations or incorrect technical terms. Preserve official resource names, API identifiers, proper names, code, and URL slugs; do not flag English text inside these as untranslated prose.",
  technical:
    "Review changes to technical instructions, code samples, commands, flags, values, Markdown structure, and Hugo shortcodes. Identify changes that alter behavior or remove required arguments. Translated comments and sample output can be intentional. Do not claim links are broken without evidence in the supplied documents.",
};

export function migrateReviewTasks(
  saved: ReviewTask[] | undefined,
  version: unknown,
): ReviewTask[] {
  if (!saved) return defaultTasks.map((task) => ({ ...task }));
  if (version === 2) return saved;
  const untouched = Object.entries(legacyInstructions).every(
    ([id, instructions]) =>
      saved.some(
        (task) => task.id === id && task.instructions === instructions,
      ),
  );
  const migrated = saved.map((task) => {
    const current = defaultTasks.find((builtin) => builtin.id === task.id);
    return current && task.instructions === legacyInstructions[task.id]
      ? { ...task, instructions: current.instructions }
      : task;
  });
  if (untouched && !migrated.some((task) => task.id === "presentation"))
    migrated.push({
      ...defaultTasks.find((task) => task.id === "presentation")!,
      enabled: saved.some((task) => task.enabled),
    });
  return migrated;
}

export function validateTasks(tasks: ReviewTask[], concurrency: number): void {
  if (!Array.isArray(tasks) || tasks.length > 20)
    throw new Error("Configure at most 20 review tasks.");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4)
    throw new Error("Parallel task limit must be between 1 and 4.");
  const identifiers = new Set<string>();
  for (const task of tasks) {
    if (
      !task ||
      typeof task.id !== "string" ||
      !/^[a-z0-9-]{1,80}$/.test(task.id) ||
      identifiers.has(task.id)
    )
      throw new Error("Review tasks need unique identifiers.");
    identifiers.add(task.id);
    if (
      typeof task.name !== "string" ||
      !task.name.trim() ||
      task.name.length > 80 ||
      typeof task.instructions !== "string" ||
      !task.instructions.trim() ||
      task.instructions.length > 4000 ||
      typeof task.enabled !== "boolean"
    )
      throw new Error(
        "Each task needs a name and instructions of at most 4,000 characters.",
      );
  }
}

export async function runReviewTasks(
  tasks: ReviewTask[],
  concurrency: number,
  execute: (
    task: ReviewTask,
  ) => Promise<{ model: string; findings: Finding[] }>,
  onUpdate: (runs: TaskRun[]) => void = () => {},
): Promise<TaskRun[]> {
  validateTasks(tasks, concurrency);
  const enabled = tasks.filter((task) => task.enabled);
  const runs: TaskRun[] = enabled.map((task) => ({
    taskId: task.id,
    taskName: task.name,
    status: "queued",
    findings: [],
  }));
  const publish = () => onUpdate(runs.map((run) => ({ ...run })));
  let cursor = 0;
  publish();
  async function worker() {
    while (cursor < enabled.length) {
      const index = cursor++;
      const task = enabled[index];
      runs[index] = { ...runs[index], status: "running" };
      publish();
      try {
        const result = await execute(task);
        runs[index] = {
          ...runs[index],
          status: "succeeded",
          model: result.model,
          findings: result.findings.map((finding, findingIndex) => ({
            ...finding,
            id: `llm-${task.id}-${findingIndex}`,
            taskId: task.id,
            taskName: task.name,
          })),
        };
      } catch (cause) {
        runs[index] = {
          ...runs[index],
          status: "failed",
          error: cause instanceof Error ? cause.message : String(cause),
        };
      }
      publish();
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, enabled.length) }, () =>
      worker(),
    ),
  );
  return runs;
}
