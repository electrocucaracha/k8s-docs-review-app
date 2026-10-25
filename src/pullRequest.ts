import type { Document, Workspace } from "./review";
import { readCache, writeCache } from "./localCache";

export type PullRequest = {
  number: number;
  title: string;
  url: string;
  sha: string;
};

export type PullRequestReviewComment = {
  id: number;
  path: string;
  line: number | null;
  body: string;
  author: string;
  url: string;
};

export type PullRequestComment = {
  id: number;
  body: string;
  author: string;
  date: string;
  url: string;
};

export type PullRequestCommit = {
  sha: string;
  message: string;
  author: string;
  date: string;
};

export type CommitFileChange = {
  path: string;
  previousPath?: string;
  status: string;
  additions: number;
  deletions: number;
};

export type Language = { code: string; name: string };
export type OpenPullRequest = Pick<PullRequest, "number" | "title">;

const languageCode = /^[a-z]{2,3}(?:-[a-z]{2,4})?$/;
const languageLabels: Record<string, string> = { "zh-cn": "zh", "pt-br": "pt" };

async function githubPages<T>(path: string): Promise<T[]> {
  const results: T[] = [];
  for (let page = 1; ; page++) {
    const entries = await github<T[]>(
      `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
    );
    if (!Array.isArray(entries))
      throw new Error("GitHub returned an invalid list.");
    results.push(...entries);
    if (entries.length < 100) return results;
  }
}

export async function getLanguages(): Promise<Language[]> {
  const [labels, directories] = await Promise.all([
    githubPages<{ name: string }>("/labels"),
    github<{ name: string; type: string }[]>("/contents/content"),
  ]);
  if (!Array.isArray(directories))
    throw new Error("GitHub returned an invalid language list.");
  const availableLabels = new Set(labels.map((label) => label.name));
  const names = new Intl.DisplayNames(["en"], { type: "language" });
  const codes = directories
    .filter(
      (entry) =>
        entry.type === "dir" &&
        entry.name !== "en" &&
        languageCode.test(entry.name) &&
        availableLabels.has(
          `language/${languageLabels[entry.name] ?? entry.name}`,
        ),
    )
    .map((entry) => entry.name);
  return [...codes]
    .map((code) => ({ code, name: names.of(code) ?? code }))
    .sort((first, second) => first.name.localeCompare(second.name));
}

export async function getOpenPullRequests(
  language: string,
): Promise<OpenPullRequest[]> {
  if (!languageCode.test(language)) throw new Error("Invalid language code.");
  const parameters = new URLSearchParams({
    state: "open",
    labels: `language/${languageLabels[language] ?? language}`,
    sort: "updated",
    direction: "desc",
  });
  const entries = await githubPages<
    OpenPullRequest & { pull_request?: unknown }
  >(`/issues?${parameters}`);
  return entries
    .filter(
      (entry) =>
        entry.pull_request &&
        Number.isSafeInteger(entry.number) &&
        entry.number > 0 &&
        typeof entry.title === "string",
    )
    .map(({ number, title }) => ({ number, title }));
}

export type PullRequestWorkspace = Workspace & {
  reviewPaths: string[];
  pullRequest: PullRequest;
  reviewComments: PullRequestReviewComment[];
  comments: PullRequestComment[];
  commits: PullRequestCommit[];
  localChanges?: boolean;
};

const api = "https://api.github.com/repos/kubernetes/website";
const freshFor = 10 * 60_000;
let staleBefore = 0;

class NotFound extends Error {}
export class NothingToReview extends Error {}

/** Forces the next mutable GitHub lookups to hit the network; cached copies remain as offline fallback. */
export function refreshGitHubCache() {
  staleBefore = Date.now();
}

// Immutable entries (scoped to a commit SHA) never expire; others are reused for `freshFor` and served stale when GitHub fails.
async function cached<T>(
  key: string,
  immutable: boolean,
  load: () => Promise<T>,
): Promise<T> {
  const entry = await readCache<T>("github", key);
  if (
    entry &&
    (immutable ||
      (entry.time > staleBefore && Date.now() - entry.time < freshFor))
  )
    return entry.value;
  try {
    const value = await load();
    void writeCache("github", key, value);
    return value;
  } catch (cause) {
    if (entry && !(cause instanceof NotFound)) return entry.value as T;
    throw cause;
  }
}

async function request(path: string, accept: string): Promise<Response> {
  try {
    return await fetch(`${api}${path}`, {
      headers: { Accept: accept },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error(
      "GitHub is unreachable and no cached copy is available. Check your connection and try again.",
    );
  }
}

function github<T>(path: string): Promise<T> {
  return cached(path, false, () => fetchJson<T>(path));
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await request(path, "application/vnd.github+json");
  if (!response.ok) {
    if (response.status === 404)
      throw new NotFound(
        "This PR or document was not found in kubernetes/website.",
      );
    if (response.status === 403 || response.status === 429)
      throw new Error(
        "GitHub's public API limit was reached. Try again after the rate limit resets.",
      );
    throw new Error(`GitHub request failed (${response.status}). Try again.`);
  }
  return response.json() as Promise<T>;
}

export async function getPullRequest(
  number: number,
  language = "es",
): Promise<{
  pullRequest: PullRequest;
  reviewPaths: string[];
  reviewComments: PullRequestReviewComment[];
  comments: PullRequestComment[];
  commits: PullRequestCommit[];
}> {
  if (!languageCode.test(language)) throw new Error("Invalid language code.");
  const metadata = await github<{ title: string; head: { sha: string } }>(
    `/pulls/${number}`,
  );
  if (
    typeof metadata.title !== "string" ||
    !/^[a-f0-9]{40}$/.test(metadata.head?.sha)
  )
    throw new Error("GitHub returned invalid PR metadata.");
  const reviewPaths: string[] = [];
  const comments = await githubPages<{
    id: number;
    path: string;
    line: number | null;
    original_line: number | null;
    body: string;
    user: { login: string } | null;
  }>(`/pulls/${number}/comments`);
  const reviewComments = comments.map((comment) => {
    if (
      !Number.isSafeInteger(comment.id) ||
      typeof comment.path !== "string" ||
      typeof comment.body !== "string"
    )
      throw new Error(
        "GitHub returned an invalid pull request review comment.",
      );
    return {
      id: comment.id,
      path: comment.path,
      line: Number.isSafeInteger(comment.line)
        ? comment.line
        : Number.isSafeInteger(comment.original_line)
          ? comment.original_line
          : null,
      body: comment.body,
      author:
        typeof comment.user?.login === "string"
          ? comment.user.login
          : "Deleted user",
      url: `https://github.com/kubernetes/website/pull/${number}#discussion_r${comment.id}`,
    };
  });
  const conversation = await githubPages<{
    id: number;
    body: string;
    user: { login: string } | null;
    created_at: string;
    html_url: string;
  }>(`/issues/${number}/comments`);
  const pullRequestComments = conversation.map((comment) => {
    if (
      !Number.isSafeInteger(comment.id) ||
      typeof comment.body !== "string" ||
      typeof comment.created_at !== "string" ||
      typeof comment.html_url !== "string"
    )
      throw new Error("GitHub returned an invalid pull request comment.");
    return {
      id: comment.id,
      body: comment.body,
      author: comment.user?.login ?? "Deleted user",
      date: comment.created_at,
      url: comment.html_url,
    };
  });
  const commits = await githubPages<{
    sha: string;
    commit: { message: string; author: { name: string; date: string } | null };
    author: { login: string } | null;
  }>(`/pulls/${number}/commits`);
  const pullRequestCommits = commits.map((item) => {
    if (
      !/^[a-f0-9]{40}$/.test(item.sha) ||
      typeof item.commit?.message !== "string" ||
      typeof item.commit.author?.date !== "string"
    )
      throw new Error("GitHub returned an invalid pull request commit.");
    return {
      sha: item.sha,
      message: item.commit.message.split("\n", 1)[0],
      author: item.author?.login ?? item.commit.author.name,
      date: item.commit.author.date,
    };
  });
  for (let page = 1; page <= 30; page++) {
    const files = await github<{ filename: string; status: string }[]>(
      `/pulls/${number}/files?per_page=100&page=${page}`,
    );
    if (!Array.isArray(files))
      throw new Error("GitHub returned an invalid file list.");
    for (const file of files) {
      if (
        file.status !== "removed" &&
        file.filename.startsWith(`content/${language}/`) &&
        file.filename.endsWith(".md") &&
        !file.filename.includes("\\") &&
        !file.filename
          .split("/")
          .some((part) => part === ".." || part.startsWith("."))
      )
        reviewPaths.push(file.filename);
    }
    if (files.length < 100) break;
    if (page === 30)
      throw new Error("This PR exceeds GitHub's 3,000-file review limit.");
  }
  if (!reviewPaths.length)
    throw new NothingToReview(
      `This PR has no added or modified ${language} Markdown files to review.`,
    );
  return {
    pullRequest: {
      number,
      title: metadata.title,
      url: `https://github.com/kubernetes/website/pull/${number}`,
      sha: metadata.head.sha,
    },
    reviewPaths,
    reviewComments,
    comments: pullRequestComments,
    commits: pullRequestCommits,
  };
}

export async function comparePullRequestCommits(
  base: string,
  head: string,
): Promise<CommitFileChange[]> {
  if (![base, head].every((sha) => /^[a-f0-9]{40}$/.test(sha)) || base === head)
    throw new Error("Select two different valid PR commits.");
  const result = await cached<{ files: CommitFileChange[] }>(
    `compare:${base}...${head}`,
    true,
    async () => {
      const raw = await fetchJson<{
        files:
          | {
              filename: string;
              previous_filename?: string;
              status: string;
              additions: number;
              deletions: number;
            }[]
          | null;
      }>(`/compare/${base}...${head}`);
      if (!Array.isArray(raw.files))
        throw new Error("GitHub returned an invalid commit comparison.");
      return {
        files: raw.files
          .filter(
            (file) =>
              file.filename.startsWith("content/") &&
              file.filename.endsWith(".md") &&
              !file.filename.includes("\\") &&
              !file.filename
                .split("/")
                .some((part) => part === ".." || part.startsWith(".")),
          )
          .map((file) => ({
            path: file.filename,
            ...(file.previous_filename
              ? { previousPath: file.previous_filename }
              : {}),
            status: file.status,
            additions: file.additions,
            deletions: file.deletions,
          })),
      };
    },
  );
  return result.files;
}

export async function loadCommitDocument(
  path: string,
  sha: string,
): Promise<Document> {
  if (
    !/^[a-f0-9]{40}$/.test(sha) ||
    !path.startsWith("content/") ||
    path.includes("\\") ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Invalid file path or PR commit.");
  return (await remoteDocument(path, sha)) ?? { path, content: "" };
}

function remoteDocument(path: string, sha: string): Promise<Document | null> {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const target = `/contents/${encoded}?ref=${sha}`;
  return cached(`raw:${target}`, true, async () => {
    const response = await request(target, "application/vnd.github.raw+json");
    if (response.status === 404) return null;
    if (!response.ok)
      throw new Error(
        `Could not load ${path} (${response.status}). GitHub may be rate-limiting requests.`,
      );
    const content = await response.text();
    if (content.length > 4 * 1024 * 1024)
      throw new Error(`${path} exceeds the 4 MB document limit.`);
    return { path, content };
  });
}

export async function loadRemotePullRequest(
  pullRequest: PullRequest,
  reviewPaths: string[],
  reviewComments: PullRequestReviewComment[],
  comments: PullRequestComment[],
  commits: PullRequestCommit[],
): Promise<PullRequestWorkspace> {
  // Store only blob paths: the raw recursive tree of kubernetes/website is several MB.
  const tree = await cached(`tree:${pullRequest.sha}`, true, async () => {
    const raw = await fetchJson<{
      truncated: boolean;
      tree: { path: string; type: string }[];
    }>(`/git/trees/${pullRequest.sha}?recursive=1`);
    if (!Array.isArray(raw.tree))
      throw new Error("GitHub returned an invalid repository tree.");
    return {
      truncated: raw.truncated,
      paths: raw.tree
        .filter((entry) => entry.type === "blob")
        .map((entry) => entry.path),
    };
  });
  const paths = tree.paths;
  const available = new Set(paths);
  const requested = [
    ...new Set(
      reviewPaths.flatMap((path) => [
        path,
        path.replace(/^content\/[^/]+\//, "content/en/"),
      ]),
    ),
  ];
  if (requested.length > 100)
    throw new Error(
      "Browser reviews are limited to 50 translation files. Use the desktop app for larger PRs.",
    );
  const documents: Document[] = [];
  for (let index = 0; index < requested.length; index += 4) {
    const batch = await Promise.all(
      requested
        .slice(index, index + 4)
        .filter((path) => tree.truncated || available.has(path))
        .map((path) => remoteDocument(path, pullRequest.sha)),
    );
    documents.push(
      ...batch.filter((document): document is Document => document !== null),
    );
  }
  if (
    reviewPaths.some(
      (path) => !documents.some((document) => document.path === path),
    )
  )
    throw new Error(
      "The PR changed while loading, or a translation file is unavailable. Load the PR again.",
    );
  return {
    name: `website · PR #${pullRequest.number}`,
    documents,
    paths,
    complete: !tree.truncated,
    pullRequest,
    reviewPaths,
    reviewComments,
    comments,
    commits,
  };
}
