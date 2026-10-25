import { useDeferredValue, useEffect, useRef, useState } from "react";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import {
  BookOpenCheck,
  FolderOpen,
  Search,
  FileText,
  ChevronRight,
  Save,
  Link2,
  ListTree,
  Code2,
  Check,
  AlertTriangle,
  CircleAlert,
  Info,
  X,
  ArrowLeftRight,
  PanelLeftClose,
  PanelLeftOpen,
  GitPullRequest,
  RefreshCw,
  LoaderCircle,
  Settings2,
  Sparkles,
  ListChecks,
  Play,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import { Editor } from "./Editor";
import type { EditorHandle } from "./Editor";
import { mapLine, pairPath, reviewDocuments } from "./review";
import type { Document, Finding, Workspace } from "./review";
import { sample } from "./sample";
import {
  getLanguages,
  getOpenPullRequests,
  getPullRequest,
  loadRemotePullRequest,
} from "./pullRequest";
import type { Language, OpenPullRequest, PullRequestWorkspace } from "./pullRequest";
import { SettingsDialog } from "./SettingsDialog";
import { loadSettings, requestLLMReview, saveSettings } from "./llm";
import type { LLMSettings } from "./llm";
import { defaultTasks, runReviewTasks } from "./reviewTasks";
import type { TaskRun } from "./reviewTasks";
import {
  checkPublishedReferences,
  collectPublishedReferences,
  openIssueDraft,
  publishedFindings,
} from "./publishedReferences";
import type { PublishedFinding } from "./publishedReferences";
import "./App.css";

const fileName = (path: string) => path.split("/").pop() ?? path;
const displayPath = (path: string) => path.replace(/^content\/[^/]+\//, "");
const kindIcons = { links: Link2, structure: ListTree, content: Code2 };
const severityIcons = {
  error: CircleAlert,
  warning: AlertTriangle,
  info: Info,
};

async function download(content: string, name: string) {
  if (isTauri()) {
    await invoke("export_markdown", { content, name });
    return;
  }
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/markdown;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace | PullRequestWorkspace>(
    sample,
  );
  const [activePath, setActivePath] = useState(sample.documents[1].path);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | Finding["kind"]>("all");
  const [severity, setSeverity] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [sync, setSync] = useState(true);
  const [sidebar, setSidebar] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [language, setLanguage] = useState("es");
  const [languages, setLanguages] = useState<Language[]>([{ code: "es", name: "Spanish" }]);
  const [openPullRequests, setOpenPullRequests] = useState<OpenPullRequest[]>([]);
  const [selectedPullRequest, setSelectedPullRequest] = useState("");
  const [pullRequestsBusy, setPullRequestsBusy] = useState(true);
  const [languageError, setLanguageError] = useState("");
  const [pullRequestsError, setPullRequestsError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [settings, setSettings] = useState(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [llmBusy, setLLMBusy] = useState(false);
  const [llmResult, setLLMResult] = useState<{
    runs: TaskRun[];
    path: string;
    revision: string;
    english: string;
    spanish: string;
    configuration: string;
  } | null>(null);
  const [tasksExpanded, setTasksExpanded] = useState(false);
  const [referencesBusy, setReferencesBusy] = useState(false);
  const [publishedResult, setPublishedResult] = useState<{
    path: string;
    revision: string;
    english: string;
    spanish: string;
    findings: PublishedFinding[];
    pages: number;
  } | null>(null);
  const approvedProvider = useRef("");
  const englishEditor = useRef<EditorHandle>(null);
  const spanishEditor = useRef<EditorHandle>(null);
  const scrollLock = useRef(false);
  const pullRequest =
    "pullRequest" in workspace ? workspace.pullRequest : undefined;
  const reviewPaths =
    "reviewPaths" in workspace ? workspace.reviewPaths : undefined;
  const revision = pullRequest?.sha ?? workspace.name;
  const activeLanguage = activePath.split("/")[1];
  const languageName = languages.find((item) => item.code === activeLanguage)?.name ?? activeLanguage;

  const original = workspace.documents.find(
    (document) => document.path === activePath,
  )!;
  const source = workspace.documents.find(
    (document) => document.path === pairPath(activePath),
  );
  const english: Document = source ?? {
    path: pairPath(activePath),
    content: "",
  };
  const spanish: Document = {
    ...original,
    content: drafts[activePath] ?? original.content,
  };
  const deferredContent = useDeferredValue(spanish.content);
  const offlineReview = reviewDocuments(
    english,
    { ...spanish, content: deferredContent },
    workspace,
  );
  const activeLLMResult =
    llmResult?.path === activePath &&
    llmResult.revision === revision &&
    llmResult.english === english.content &&
    llmResult.spanish === spanish.content &&
    llmResult.configuration === JSON.stringify(settings)
      ? llmResult
      : null;
  const llmFindings =
    activeLLMResult?.runs.flatMap((run) => run.findings) ?? [];
  const enabledTasks = settings.tasks.filter((task) => task.enabled).map((task) => {
    if (activeLanguage === "es" || !defaultTasks.some((builtin) => builtin.id === task.id && builtin.instructions === task.instructions)) return task;
    return {
      ...task,
      name: task.name.replaceAll("Spanish", languageName),
      instructions: task.id === "grammar"
        ? `Review ${languageName} spelling, grammar, agreement, punctuation and consistency of address. Follow this language's conventions, not Spanish-specific rules. Report actionable corrections rather than subjective rewrites. Preserve names, commands, paths, URLs and quoted examples.`
        : task.instructions.replaceAll("Spanish", languageName),
    };
  });
  const activePublishedResult =
    publishedResult?.path === activePath &&
    publishedResult.revision === revision &&
    publishedResult.english === english.content &&
    publishedResult.spanish === spanish.content
      ? publishedResult
      : null;
  const review = {
    ...offlineReview,
    findings: [
      ...offlineReview.findings,
      ...llmFindings,
      ...(activePublishedResult?.findings ?? []),
    ],
  };
  const dirty = spanish.content !== original.content;
  const unsaved = Object.entries(drafts).some(
    ([path, content]) =>
      content !==
      workspace.documents.find((document) => document.path === path)?.content,
  );
  const files = workspace.documents.filter(
    (document) =>
      document.path.startsWith(`content/${activeLanguage}/`) &&
      (!reviewPaths || reviewPaths.includes(document.path)) &&
      document.path.toLowerCase().includes(query.toLowerCase()),
  );
  const filtered = review.findings.filter(
    (finding) =>
      (kind === "all" || finding.kind === kind) &&
      (severity === "all" || finding.severity === severity),
  );
  const errorCount = review.findings.filter(
    (finding) => finding.severity === "error",
  ).length;
  const warningCount = review.findings.filter(
    (finding) => finding.severity === "warning",
  ).length;
  const infoCount = review.findings.filter(
    (finding) => finding.severity === "info",
  ).length;

  useEffect(() => {
    let current = true;
    void getLanguages().then(
      (result) => { if (current) setLanguages(result); },
      (cause) => { if (current) setLanguageError(`Could not load languages: ${String(cause)}`); },
    );
    return () => { current = false; };
  }, [refresh]);

  useEffect(() => {
    let current = true;
    void getOpenPullRequests(language).then(
      (result) => { if (current) setOpenPullRequests(result); },
      (cause) => { if (current) setPullRequestsError(String(cause)); },
    ).finally(() => { if (current) setPullRequestsBusy(false); });
    return () => { current = false; };
  }, [language, refresh]);

  function updatePullRequestList(nextLanguage = language) {
    setOpenPullRequests([]);
    setSelectedPullRequest("");
    setPullRequestsBusy(true);
    setPullRequestsError("");
    if (nextLanguage === language) {
      setLanguageError("");
      setRefresh((value) => value + 1);
    } else {
      setLanguage(nextLanguage);
    }
  }

  useEffect(() => {
    if (!unsaved) return;
    const listener = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", listener);
    let release: (() => void) | undefined;
    let disposed = false;
    if (isTauri()) {
      void import("@tauri-apps/api/window").then(
        async ({ getCurrentWindow }) => {
          const unlisten = await getCurrentWindow().onCloseRequested(
            async (event) => {
              event.preventDefault();
              if (
                await confirm("Close and discard unsaved translations?", {
                  title: "Unsaved translations",
                  kind: "warning",
                })
              )
                await getCurrentWindow().destroy();
            },
          );
          if (disposed) unlisten();
          else release = unlisten;
        },
      );
    }
    return () => {
      disposed = true;
      window.removeEventListener("beforeunload", listener);
      release?.();
    };
  }, [unsaved]);

  function replaceWorkspace(next: PullRequestWorkspace) {
    const nextFile = next.documents.find((document) =>
      next.reviewPaths.includes(document.path),
    );
    if (!nextFile)
      throw new Error(
        "No changed translation Markdown files could be loaded from this PR.",
      );
    setWorkspace(next);
    setActivePath(nextFile.path);
    setDrafts({});
    setSelected(null);
    setQuery("");
    setKind("all");
    setSeverity("all");
    setLLMResult(null);
    setPublishedResult(null);
    setNotice(
      next.localChanges
        ? "Loaded cached checkout with local edits. Remote refresh was skipped to preserve them."
        : `PR #${next.pullRequest.number} loaded at ${next.pullRequest.sha.slice(0, 8)}`,
    );
  }

  const canReplace = async () =>
    !unsaved ||
    (isTauri()
      ? await confirm(
          "Discard unsaved translations and open another workspace?",
          { title: "Unsaved translations", kind: "warning" },
        )
      : window.confirm(
          "Discard unsaved translations and open another workspace?",
        ));

  async function loadPullRequest(number: number) {
    if (busy || llmBusy || !(await canReplace())) return;
    setSelectedPullRequest(String(number));
    setError("");
    setBusy(true);
    try {
      setNotice(`Loading PR #${number}...`);
      const { pullRequest, reviewPaths } = await getPullRequest(number, language);
      if (isTauri()) {
        setNotice(`Preparing local checkout for PR #${number}...`);
        const next = await invoke<PullRequestWorkspace>("load_pull_request", {
          pullRequest,
          reviewPaths,
        });
        replaceWorkspace({ ...next, native: true });
      } else {
        setNotice(`Loading files for PR #${number}...`);
        replaceWorkspace(await loadRemotePullRequest(pullRequest, reviewPaths));
      }
    } catch (cause) {
      setSelectedPullRequest("");
      setError(String(cause));
      setNotice("");
    } finally {
      setBusy(false);
    }
  }

  async function openPullRequest() {
    if (!pullRequest) return;
    try {
      if (isTauri()) await invoke("open_pull_request", { number: pullRequest.number });
      else window.open(pullRequest.url, "_blank", "noopener,noreferrer");
    } catch (cause) {
      setError(String(cause));
    }
  }

  async function saveTranslation() {
    setError("");
    if (!workspace.native) {
      await exportMarkdown(spanish.content, fileName(spanish.path));
      return;
    }
    setBusy(true);
    try {
      await invoke("save_translation", {
        path: spanish.path,
        content: spanish.content,
        original: original.content,
      });
      setWorkspace({
        ...workspace,
        documents: workspace.documents.map((document) =>
          document.path === activePath ? spanish : document,
        ),
      });
      setNotice("Spanish translation saved");
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function exportMarkdown(content: string, name: string) {
    try {
      await download(content, name);
      setNotice("Export complete. Working copy retained.");
    } catch (cause) {
      setError(String(cause));
    }
  }

  async function checkReferences() {
    if (referencesBusy || busy) return;
    setReferencesBusy(true);
    setError("");
    try {
      const references = collectPublishedReferences(english, spanish);
      const results = await checkPublishedReferences(
        references,
        (done, total) =>
          setNotice(`Checking published references: ${done}/${total}`),
      );
      setPublishedResult({
        path: activePath,
        revision,
        english: english.content,
        spanish: spanish.content,
        findings: publishedFindings(
          references,
          results,
          english,
          spanish,
          pullRequest?.url,
        ),
        pages: results.length,
      });
      const missing = results.filter(
        (result) => result.status === 404 || result.status === 410,
      ).length;
      const unverified = results.filter(
        (result) =>
          result.error ||
          !result.status ||
          (result.status !== 404 &&
            result.status !== 410 &&
            (result.status < 200 || result.status >= 300)),
      ).length;
      setNotice(
        `Published references: ${results.length} pages checked, ${missing} missing, ${unverified} unverified. Other external hosts and published anchors are not checked.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setReferencesBusy(false);
    }
  }

  async function createIssue(url: string) {
    try {
      await openIssueDraft(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function configureLLM(next: LLMSettings) {
    saveSettings(next);
    setSettings({
      ...next,
      model: next.model.trim(),
      apiBase: next.apiBase.trim(),
      pythonExecutable: next.pythonExecutable.trim(),
    });
    setSettingsOpen(false);
    setNotice("LLM settings saved");
  }

  async function runLLMReview(taskId?: string) {
    if (busy || llmBusy || !source) return;
    const tasks = enabledTasks.filter((task) => !taskId || task.id === taskId);
    if (!tasks.length) {
      setError("Enable at least one review task in Settings.");
      return;
    }
    const configuration = JSON.stringify(settings);
    const local =
      settings.provider === "ollama" &&
      /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/.test(
        settings.apiBase,
      );
    if (!local && approvedProvider.current !== configuration) {
      const message = `Send this English and Spanish document pair to ${settings.apiBase || settings.provider} for ${tasks.length} LLM review task(s)?`;
      const accepted = isTauri()
        ? await confirm(message, {
            title: "LLM document review",
            kind: "warning",
          })
        : window.confirm(message);
      if (!accepted) return;
      approvedProvider.current = configuration;
    }
    setLLMBusy(true);
    setError("");
    setTasksExpanded(true);
    const snapshot = {
      path: activePath,
      revision,
      english: english.content,
      spanish: spanish.content,
      configuration,
    };
    const preserved = taskId
      ? (activeLLMResult?.runs.filter((run) => run.taskId !== taskId) ?? [])
      : [];
    try {
      const runs = await runReviewTasks(
        tasks,
        settings.concurrency,
        (task) =>
          requestLLMReview({
            action: "review",
            settings,
            task,
            english: english.content,
            spanish: spanish.content,
            language: activeLanguage,
          }),
        (current) =>
          setLLMResult({ ...snapshot, runs: [...preserved, ...current] }),
      );
      const failures = runs.filter((run) => run.status === "failed").length;
      setNotice(
        `LLM tasks complete: ${runs.length - failures}/${runs.length} succeeded, ${runs.flatMap((run) => run.findings).length} findings${failures ? `; ${failures} failed` : ""}`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLLMBusy(false);
    }
  }

  function selectFinding(finding: Finding) {
    setSelected(finding.id);
    scrollLock.current = true;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        scrollLock.current = false;
      }),
    );
    const primary = finding.side === "en" ? englishEditor : spanishEditor;
    const peer = finding.side === "en" ? spanishEditor : englishEditor;
    primary.current?.jump(finding.line, true);
    if (sync)
      peer.current?.jump(
        mapLine(
          finding.line,
          review.alignment,
          finding.side,
          primary.current?.lineCount() ?? 1,
          peer.current?.lineCount() ?? 1,
        ),
      );
  }

  function synchronize(side: "en" | "es", line: number) {
    if (!sync || scrollLock.current) return;
    scrollLock.current = true;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        scrollLock.current = false;
      }),
    );
    const source =
      side === "en" ? englishEditor.current : spanishEditor.current;
    const target =
      side === "en" ? spanishEditor.current : englishEditor.current;
    target?.jump(
      mapLine(
        line,
        review.alignment,
        side,
        source?.lineCount() ?? 1,
        target.lineCount(),
      ),
    );
  }

  return (
    <div className={`app ${sidebar ? "" : "sidebar-hidden"}`}>
      <header className="app-header">
        <div className="brand">
          <div className="brand-symbol">
            <img src="/kubernetes.png" alt="" width="29" height="29" />
          </div>
          <div>
            <h1>Kubernetes Docs Review</h1>
          </div>
        </div>
        <div className="header-actions">
          <span className="local-indicator">
            <span />{" "}
            {pullRequest
              ? workspace.native
                ? "Local checkout"
                : "GitHub snapshot"
              : "Example workspace"}
          </span>
          <div className="pr-form">
            <select
              className="language-select"
              aria-label="Language"
              value={language}
              disabled={busy || llmBusy}
              onChange={(event) => updatePullRequestList(event.target.value)}
            >
              {languages.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
            <label className="pr-input" aria-busy={pullRequestsBusy || busy}>
              {pullRequestsBusy || busy ? <LoaderCircle size={16} className="spin" /> :
              <GitPullRequest size={16} />
              }
              <select
                aria-label="Pull request"
                value={selectedPullRequest}
                disabled={busy || llmBusy || pullRequestsBusy || !openPullRequests.length}
                onChange={(event) => { if (event.target.value) void loadPullRequest(Number(event.target.value)); }}
              >
                <option value="">{pullRequestsBusy ? "Loading pull requests..." : pullRequestsError ? "Could not load pull requests" : openPullRequests.length ? "Select a pull request" : "No open pull requests"}</option>
                {openPullRequests.map((item) => <option key={item.number} value={item.number}>#{item.number} {item.title}</option>)}
              </select>
            </label>
            <button
              className="icon-button"
              type="button"
              disabled={busy || llmBusy || pullRequestsBusy}
              title="Refresh pull requests"
              aria-label="Refresh pull requests"
              onClick={() => updatePullRequestList()}
            >
              <RefreshCw size={16} />
            </button>
            <button
              className="icon-button"
              type="button"
              disabled={!pullRequest || busy}
              title="Open PR on GitHub"
              aria-label="Open PR on GitHub"
              onClick={() => void openPullRequest()}
            >
              <ExternalLink size={16} />
            </button>
          </div>
          <button
            className="icon-button"
            title="Settings"
            aria-label="Settings"
            disabled={llmBusy}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 size={18} />
          </button>
        </div>
      </header>

      <aside className="sidebar">
        <div className="sidebar-title">
          <span>EXPLORER</span>
          <button
            className="icon-button"
            title="Hide explorer"
            aria-label="Hide explorer"
            onClick={() => setSidebar(false)}
          >
            <PanelLeftClose size={16} />
          </button>
        </div>
        <div className="workspace-name">
          <FolderOpen size={17} />
          <strong title={workspace.name}>{workspace.name}</strong>
        </div>
        {pullRequest && (
          <div className="pr-context">
            <span>kubernetes/website</span>
            <strong title={pullRequest.title}>{pullRequest.title}</strong>
            <small>{pullRequest.sha.slice(0, 8)}</small>
          </div>
        )}
        <label className="search">
          <Search size={15} />
          <input
            aria-label="Find a file"
            placeholder="Find a file..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="file-list" aria-label={`${languageName} files`}>
          {files.map((document) => (
            <button
              key={document.path}
              className={`file-item ${document.path === activePath ? "active" : ""}`}
              onClick={() => {
                setActivePath(document.path);
                setSelected(null);
                setNotice("");
              }}
              title={document.path}
            >
              <FileText size={16} />
              <span>
                <strong>{fileName(document.path)}</strong>
                <small>
                  {displayPath(document.path)
                    .split("/")
                    .slice(0, -1)
                    .join("/") || `content/${activeLanguage}`}
                </small>
              </span>
              {drafts[document.path] !== undefined &&
              drafts[document.path] !== document.content ? (
                <span className="dirty-dot" />
              ) : (
                <ChevronRight size={13} />
              )}
            </button>
          ))}
          {!files.length && <p className="empty-message">No matching files</p>}
        </div>
        <div className="sidebar-footer">
          <span className="locale-badge">{activeLanguage.toUpperCase()}</span>
          <span>
            {
              workspace.documents.filter(
                (document) =>
                  document.path.startsWith(`content/${activeLanguage}/`) &&
                  (!reviewPaths || reviewPaths.includes(document.path)),
              ).length
            }{" "}
            {pullRequest ? `changed ${languageName} files` : `${languageName} files`}
          </span>
          <span className="offline-dot" />
        </div>
      </aside>

      <main className="workspace">
        <div className="document-toolbar">
          <div className="breadcrumb">
            {!sidebar && (
              <button
                className="icon-button"
                title="Show explorer"
                aria-label="Show explorer"
                onClick={() => setSidebar(true)}
              >
                <PanelLeftOpen size={17} />
              </button>
            )}
            <FileText size={16} />
            <select
              className="mobile-file-select"
              aria-label="Review file"
              value={activePath}
              onChange={(event) => {
                setActivePath(event.target.value);
                setSelected(null);
              }}
            >
              {workspace.documents
                .filter(
                  (document) =>
                    document.path.startsWith(`content/${activeLanguage}/`) &&
                    (!reviewPaths || reviewPaths.includes(document.path)),
                )
                .map((document) => (
                  <option key={document.path} value={document.path}>
                    {displayPath(document.path)}
                  </option>
                ))}
            </select>
            <span title={displayPath(activePath)}>
              {displayPath(activePath)}
            </span>
            {dirty && (
              <span className="dirty-dot" title="Unsaved translation" />
            )}
          </div>
          <div className="document-actions">
            <button
              title="Check page availability on kubernetes.io/docs"
              aria-label="Check references"
              disabled={busy || referencesBusy}
              onClick={() => void checkReferences()}
            >
              {referencesBusy ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <Link2 size={15} />
              )}
              <span>{referencesBusy ? "Checking..." : "Check references"}</span>
            </button>
            <button
              title="Send the current pair to the configured LLM provider"
              aria-label="Review with LLM"
              disabled={busy || llmBusy || !source || !enabledTasks.length}
              onClick={() => void runLLMReview()}
            >
              {llmBusy ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <Sparkles size={15} />
              )}
              <span>{llmBusy ? "Reviewing..." : "Review with LLM"}</span>
            </button>
            {workspace.native && (
              <button
                className="icon-button"
                title={`Save ${languageName} translation`}
                aria-label={`Save ${languageName} translation`}
                disabled={busy}
                onClick={() => void saveTranslation()}
              >
                <Save size={17} />
              </button>
            )}
            <button
              className="icon-button"
              title={`Download ${languageName} translation`}
              aria-label={`Download ${languageName} translation`}
              disabled={busy}
              onClick={() =>
                void exportMarkdown(spanish.content, fileName(spanish.path))
              }
            >
              <FileText size={16} />
            </button>
          </div>
        </div>

        {(error || languageError || pullRequestsError || notice || !source) && (
          <div
            className={`message-bar ${error || languageError || pullRequestsError || !source ? "is-error" : ""}`}
            role={error || languageError || pullRequestsError ? "alert" : "status"}
          >
            {error || languageError || pullRequestsError ||
              (!source
                ? "English counterpart is missing from this workspace."
                : notice)}
            <button
              className="icon-button"
              aria-label="Dismiss message"
              onClick={() => {
                setError("");
                setLanguageError("");
                setPullRequestsError("");
                setNotice("");
              }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        <section className="comparison" aria-label="Translation comparison">
          <div className="editor-pane">
            <div className="pane-header">
              <div>
                <span className="locale-badge">EN</span>
                <strong>English</strong>
                <span className="pane-tag">SOURCE</span>
              </div>
              <span>{english.content.split("\n").length} lines</span>
            </div>
            <Editor
              key={`en-${revision}-${activePath}`}
              ref={englishEditor}
              label="English source"
              content={english.content}
              readOnly
              findings={review.findings.filter(
                (finding) => finding.side === "en",
              )}
              onScroll={(line) => synchronize("en", line)}
            />
          </div>
          <div className="editor-pane spanish-pane">
            <div className="pane-header">
              <div>
                <span className="locale-badge spanish">{activeLanguage.toUpperCase()}</span>
                <strong>{activeLanguage === "es" ? "Español" : languageName}</strong>
                <span className="pane-tag editable">
                  {dirty ? "MODIFIED" : "TRANSLATION"}
                </span>
              </div>
              <span>{spanish.content.split("\n").length} lines</span>
            </div>
            <Editor
              key={`es-${revision}-${activePath}`}
              ref={spanishEditor}
              label={`${languageName} translation`}
              content={spanish.content}
              findings={review.findings.filter(
                (finding) => finding.side === "es",
              )}
              onChange={(content) =>
                setDrafts((previous) => ({
                  ...previous,
                  [activePath]: content,
                }))
              }
              onScroll={(line) => synchronize("es", line)}
            />
          </div>
        </section>

        <section className="task-progress" aria-label="LLM review tasks">
          <button
            className="task-progress-toggle"
            aria-expanded={tasksExpanded}
            onClick={() => setTasksExpanded((current) => !current)}
          >
            <ListChecks size={14} />
            <span>Review Tasks</span>
            <small>
              {activeLLMResult
                ? `${activeLLMResult.runs.filter((run) => run.status === "succeeded" || run.status === "failed").length}/${activeLLMResult.runs.length} finished`
                : `${enabledTasks.length} enabled`}
            </small>
            <ChevronDown size={14} />
          </button>
          {tasksExpanded && (
            <div className="task-progress-list">
              {enabledTasks.map((task) => {
                const run = activeLLMResult?.runs.find(
                  (item) => item.taskId === task.id,
                );
                return (
                  <div key={task.id} className="task-progress-row">
                    <div>
                      <strong>{task.name}</strong>
                      {run?.error && <p>{run.error}</p>}
                    </div>
                    <span className={`task-status ${run?.status ?? "ready"}`}>
                      {run?.status ?? "ready"}
                      {run?.status === "succeeded"
                        ? ` · ${run.findings.length}`
                        : ""}
                    </span>
                    <button
                      className="icon-button"
                      title={`${run?.status === "failed" ? "Retry" : "Run"} ${task.name}`}
                      aria-label={`Run ${task.name}`}
                      disabled={busy || llmBusy || !source}
                      onClick={() => void runLLMReview(task.id)}
                    >
                      <Play size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="findings" aria-label="Review findings">
          <div className="findings-header">
            <div className="findings-heading">
              <h2>Review findings</h2>
              <span className="count-badge">{review.findings.length}</span>
              <span className="current-file">Current file</span>
            </div>
            <label className="severity-filter">
              <span>Severity</span>
              <select
                aria-label="Filter by severity"
                value={severity}
                onChange={(event) => setSeverity(event.target.value)}
              >
                <option value="all">All severities</option>
                <option value="error">Errors</option>
                <option value="warning">Warnings</option>
                <option value="info">Notes</option>
              </select>
            </label>
          </div>
          <div
            className="finding-tabs"
            role="tablist"
            aria-label="Finding category"
          >
            {(["all", "links", "structure", "content"] as const).map(
              (category) => {
                const Icon =
                  category === "all" ? BookOpenCheck : kindIcons[category];
                const count =
                  category === "all"
                    ? review.findings.length
                    : review.findings.filter(
                        (finding) => finding.kind === category,
                      ).length;
                return (
                  <button
                    key={category}
                    role="tab"
                    aria-selected={kind === category}
                    className={kind === category ? "selected" : ""}
                    onClick={() => setKind(category)}
                  >
                    <Icon size={14} />
                    {category === "all"
                      ? "All findings"
                      : category === "links"
                        ? "References"
                        : category === "structure"
                          ? "Structure"
                          : "Content"}
                    <span>{count}</span>
                  </button>
                );
              },
            )}
          </div>
          <div className="findings-list">
            {filtered.map((finding) => {
              const Icon = severityIcons[finding.severity];
              return (
                <div className="finding-item" key={finding.id}>
                  <button
                    className={`finding-row ${selected === finding.id ? "selected" : ""}`}
                    key={finding.id}
                    onClick={() => selectFinding(finding)}
                  >
                    <Icon
                      size={16}
                      className={`severity-icon ${finding.severity}`}
                    />
                    <div>
                      <strong>{finding.title}</strong>
                      {finding.id.startsWith("llm-") && (
                        <span className="llm-badge">
                          LLM
                          {"taskName" in finding
                            ? ` · ${String(finding.taskName)}`
                            : ""}
                        </span>
                      )}
                      <p>{finding.detail}</p>
                    </div>
                    <span className="finding-location">
                      {finding.side.toUpperCase()}
                      <span>L{finding.line}</span>
                    </span>
                    <ChevronRight size={14} />
                  </button>
                  {"issueUrl" in finding &&
                    typeof finding.issueUrl === "string" && (
                      <button
                        className="issue-draft-button"
                        title="Create GitHub issue with prefilled reference details"
                        aria-label={`Create GitHub issue for ${finding.side.toUpperCase()} line ${finding.line}`}
                        onClick={() =>
                          void createIssue(finding.issueUrl as string)
                        }
                      >
                        <ExternalLink size={14} />
                        <span>Create issue</span>
                      </button>
                    )}
                </div>
              );
            })}
            {!filtered.length && (
              <div className="findings-empty">
                <Check size={22} />
                <strong>
                  {review.findings.length
                    ? "No findings match these filters"
                    : "No findings from offline checks"}
                </strong>
              </div>
            )}
          </div>
        </section>
        <footer className="status-bar">
          <div>
            <span className="status-check">
              <Check size={13} />
              {activeLLMResult ? "Offline + LLM" : "Offline checks"}
            </span>
            <span className="status-totals">
              <CircleAlert size={12} />
              {errorCount}
              <AlertTriangle size={12} />
              {warningCount}
              <Info size={12} />
              {infoCount}
            </span>
          </div>
          <div>
            <span className="alignment-count">
              {review.alignment.length} heading pairs · {review.externalLinks}{" "}
              external references
              {activePublishedResult
                ? ` · ${activePublishedResult.pages} published pages checked`
                : ""}
            </span>
            <label className="sync-control">
              <ArrowLeftRight size={13} />
              <input
                type="checkbox"
                checked={sync}
                onChange={(event) => setSync(event.target.checked)}
              />
              Sync scroll
            </label>
          </div>
        </footer>
      </main>

      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          onSave={configureLLM}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
