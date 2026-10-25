import type { Document, Workspace } from "./review";

export type PullRequest = {
  number: number;
  title: string;
  url: string;
  sha: string;
};

export type Language = { code: string; name: string };
export type OpenPullRequest = Pick<PullRequest, "number" | "title">;

const languageCode = /^[a-z]{2,3}(?:-[a-z]{2,4})?$/;
const languageLabels: Record<string, string> = { "zh-cn": "zh", "pt-br": "pt" };

async function githubPages<T>(path: string): Promise<T[]> {
  const results: T[] = [];
  for (let page = 1; ; page++) {
    const entries = await github<T[]>(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
    if (!Array.isArray(entries)) throw new Error("GitHub returned an invalid list.");
    results.push(...entries);
    if (entries.length < 100) return results;
  }
}

export async function getLanguages(): Promise<Language[]> {
  const [labels, directories] = await Promise.all([
    githubPages<{ name: string }>("/labels"),
    github<{ name: string; type: string }[]>("/contents/content"),
  ]);
  if (!Array.isArray(directories)) throw new Error("GitHub returned an invalid language list.");
  const availableLabels = new Set(labels.map((label) => label.name));
  const names = new Intl.DisplayNames(["en"], { type: "language" });
  const codes = directories.filter((entry) => entry.type === "dir" && entry.name !== "en" && languageCode.test(entry.name) && availableLabels.has(`language/${languageLabels[entry.name] ?? entry.name}`)).map((entry) => entry.name);
  return [...codes].map((code) => ({ code, name: names.of(code) ?? code })).sort((first, second) => first.name.localeCompare(second.name));
}

export async function getOpenPullRequests(language: string): Promise<OpenPullRequest[]> {
  if (!languageCode.test(language)) throw new Error("Invalid language code.");
  const parameters = new URLSearchParams({ state: "open", labels: `language/${languageLabels[language] ?? language}`, sort: "updated", direction: "desc" });
  const entries = await githubPages<OpenPullRequest & { pull_request?: unknown }>(`/issues?${parameters}`);
  return entries.filter((entry) => entry.pull_request && Number.isSafeInteger(entry.number) && entry.number > 0 && typeof entry.title === "string").map(({ number, title }) => ({ number, title }));
}

export type PullRequestWorkspace = Workspace & {
  reviewPaths: string[];
  pullRequest: PullRequest;
  localChanges?: boolean;
};

const api = "https://api.github.com/repos/kubernetes/website";
const snapshots = new Map<string, Workspace>();

async function github<T>(path: string): Promise<T> {
  const response = await fetch(`${api}${path}`, {
    headers: { Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    if (response.status === 404) throw new Error("This PR or document was not found in kubernetes/website.");
    if (response.status === 403 || response.status === 429) throw new Error("GitHub's public API limit was reached. Try again after the rate limit resets.");
    throw new Error(`GitHub request failed (${response.status}). Try again.`);
  }
  return response.json() as Promise<T>;
}

export async function getPullRequest(number: number, language = "es"): Promise<{ pullRequest: PullRequest; reviewPaths: string[] }> {
  if (!languageCode.test(language)) throw new Error("Invalid language code.");
  const metadata = await github<{ title: string; head: { sha: string } }>(`/pulls/${number}`);
  if (typeof metadata.title !== "string" || !/^[a-f0-9]{40}$/.test(metadata.head?.sha)) throw new Error("GitHub returned invalid PR metadata.");
  const reviewPaths: string[] = [];
  for (let page = 1; page <= 30; page++) {
    const files = await github<{ filename: string; status: string }[]>(`/pulls/${number}/files?per_page=100&page=${page}`);
    if (!Array.isArray(files)) throw new Error("GitHub returned an invalid file list.");
    for (const file of files) {
      if (file.status !== "removed" && file.filename.startsWith(`content/${language}/`) && file.filename.endsWith(".md") && !file.filename.includes("\\") && !file.filename.split("/").some((part) => part === ".." || part.startsWith("."))) reviewPaths.push(file.filename);
    }
    if (files.length < 100) break;
    if (page === 30) throw new Error("This PR exceeds GitHub's 3,000-file review limit.");
  }
  if (!reviewPaths.length) throw new Error(`This PR has no added or modified ${language} Markdown files to review.`);
  return {
    pullRequest: { number, title: metadata.title, url: `https://github.com/kubernetes/website/pull/${number}`, sha: metadata.head.sha },
    reviewPaths,
  };
}

async function remoteDocument(path: string, sha: string): Promise<Document | null> {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${api}/contents/${encoded}?ref=${sha}`, {
    headers: { Accept: "application/vnd.github.raw+json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status}). GitHub may be rate-limiting requests.`);
  const content = await response.text();
  if (content.length > 4 * 1024 * 1024) throw new Error(`${path} exceeds the 4 MB document limit.`);
  return { path, content };
}

export async function loadRemotePullRequest(pullRequest: PullRequest, reviewPaths: string[]): Promise<PullRequestWorkspace> {
  const key = `${pullRequest.sha}:${reviewPaths.join("\0")}`;
  const cached = snapshots.get(key);
  if (cached) return { ...cached, pullRequest, reviewPaths };
  const tree = await github<{ truncated: boolean; tree: { path: string; type: string }[] }>(`/git/trees/${pullRequest.sha}?recursive=1`);
  if (!Array.isArray(tree.tree)) throw new Error("GitHub returned an invalid repository tree.");
  const paths = tree.tree.filter((entry) => entry.type === "blob").map((entry) => entry.path);
  const available = new Set(paths);
  const requested = [...new Set(reviewPaths.flatMap((path) => [path, path.replace(/^content\/[^/]+\//, "content/en/")]))];
  if (requested.length > 100) throw new Error("Browser reviews are limited to 50 translation files. Use the desktop app for larger PRs.");
  const documents: Document[] = [];
  for (let index = 0; index < requested.length; index += 4) {
    const batch = await Promise.all(requested.slice(index, index + 4).filter((path) => tree.truncated || available.has(path)).map((path) => remoteDocument(path, pullRequest.sha)));
    documents.push(...batch.filter((document): document is Document => document !== null));
  }
  if (reviewPaths.some((path) => !documents.some((document) => document.path === path))) throw new Error("The PR changed while loading, or a translation file is unavailable. Load the PR again.");
  const workspace: Workspace = { name: `website · PR #${pullRequest.number}`, documents, paths, complete: !tree.truncated };
  if (snapshots.size >= 5) snapshots.clear();
  snapshots.set(key, workspace);
  return { ...workspace, pullRequest, reviewPaths };
}