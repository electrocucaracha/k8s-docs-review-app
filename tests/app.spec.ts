import { test, expect } from "@playwright/test";
import { defaultTasks } from "../src/reviewTasks";

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/api\.github\.com\/repos\/kubernetes\/website\/(?:labels\?|issues\?|contents\/content$)/, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/contents/content")) return route.fulfill({ json: ["en", "es", "fr", "zh-cn", "pt-br"].map((name) => ({ name, type: "dir" })) });
    return route.fulfill({ json: url.pathname.endsWith("/labels")
      ? [{ name: "language/es" }, { name: "language/fr" }, { name: "language/zh" }, { name: "language/pt" }, { name: "language/ar" }, { name: "language/en" }, { name: "kind/documentation" }]
      : [{ number: 42, title: "Update translation", pull_request: {} }] });
  });
  await page.goto("/");
});

test("checks published references and opens a prefilled GitHub issue draft", async ({
  page,
  context,
}) => {
  const checked: string[] = [];
  await page.route("**/api/references/check", async (route) => {
    const { url } = route.request().postDataJSON();
    checked.push(url);
    await route.fulfill({
      json: {
        url,
        finalUrl: url,
        status: url.includes("missing-scaling-guide") ? 404 : 200,
      },
    });
  });
  await context.route(
    "https://github.com/kubernetes/website/issues/new?**",
    (route) =>
      route.fulfill({ contentType: "text/html", body: "<h1>Issue draft</h1>" }),
  );
  await page
    .getByRole("button", { name: "Check references", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "2 pages checked, 1 missing",
  );
  expect(checked).toHaveLength(2);
  await expect(page.locator(".issue-draft-button")).toHaveCount(1);
  await page.locator(".issue-draft-button").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/published-references-1440.png",
    fullPage: true,
  });
  const pending = context.waitForEvent("page");
  await page
    .getByRole("button", {
      name: "Create GitHub issue for ES line 32",
      exact: true,
    })
    .click();
  const draft = await pending;
  await draft.waitForLoadState("domcontentloaded");
  const url = new URL(draft.url());
  expect(url.origin + url.pathname).toBe(
    "https://github.com/kubernetes/website/issues/new",
  );
  expect(url.searchParams.get("title")).toContain("missing-scaling-guide");
  expect(url.searchParams.get("body")).toContain("HTTP status: 404");
  expect(url.searchParams.get("body")).toContain("Source line: 32");
  expect(url.searchParams.get("body")).toContain(
    "content/es/docs/concepts/workloads/deployments.md",
  );
  await draft.close();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".issue-draft-button").scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/published-references-390.png",
    fullPage: true,
  });
  await page.getByLabel("Spanish translation", { exact: true }).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("\n\nTexto nuevo.");
  await expect(page.locator(".issue-draft-button")).toHaveCount(0);
});

test("temporary site failures do not offer a broken-page issue action", async ({
  page,
}) => {
  await page.route("**/api/references/check", async (route) => {
    const { url } = route.request().postDataJSON();
    await route.fulfill({ json: { url, status: 503 } });
  });
  await page
    .getByRole("button", { name: "Check references", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "0 missing, 2 unverified",
  );
  await expect(page.locator(".issue-draft-button")).toHaveCount(0);
  await expect(
    page
      .locator(".finding-row")
      .filter({ hasText: "Published reference could not be verified" })
      .first(),
  ).toBeVisible();
});

test("published reference bridge rejects external hosts and cross-origin callers", async ({
  request,
}) => {
  const invalid = await request.post("/api/references/check", {
    headers: { Origin: "http://127.0.0.1:5173" },
    data: { url: "http://127.0.0.1/private" },
  });
  expect(invalid.status()).toBe(400);
  const crossOrigin = await request.post("/api/references/check", {
    headers: { Origin: "https://untrusted.example.invalid" },
    data: { url: "https://kubernetes.io/docs/" },
  });
  expect(crossOrigin.status()).toBe(403);
});

test("task settings migrate existing preferences and persist custom tasks", async ({
  page,
}) => {
  await page.evaluate(() =>
    localStorage.setItem(
      "k8s-docs-review.llm-settings",
      JSON.stringify({
        provider: "ollama",
        model: "llama3.2",
        apiBase: "http://127.0.0.1:11434",
        pythonExecutable: "",
      }),
    ),
  );
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "Review Tasks", exact: true }).click();
  await expect(page.locator(".task-definition")).toHaveCount(
    defaultTasks.length,
  );
  for (const checkbox of await page
    .getByRole("dialog")
    .getByRole("checkbox")
    .all())
    await checkbox.uncheck();
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page
    .getByLabel("Task name", { exact: true })
    .fill("Inclusive language");
  await page
    .getByLabel("Task instructions", { exact: true })
    .fill("Review the Spanish translation for inclusive and neutral language.");
  await page.getByLabel("Parallel task limit").selectOption("2");
  await page.getByRole("button", { name: "Save settings" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "Review Tasks", exact: true }).click();
  await expect(page.getByLabel("Enable Inclusive language")).toBeChecked();
  await expect(
    page.getByLabel("Enable Translation accuracy"),
  ).not.toBeChecked();
  await expect(page.getByLabel("Parallel task limit")).toHaveValue("2");
  await page.getByRole("button", { name: "Close settings" }).click();
  const requests: string[] = [];
  await page.route("**/api/llm/review", async (route) => {
    const payload = route.request().postDataJSON();
    requests.push(payload.task.name);
    expect(payload.task.instructions).toContain("inclusive and neutral");
    await route.fulfill({ json: { model: "ollama/llama3.2", findings: [] } });
  });
  await page
    .getByRole("button", { name: "Review with LLM", exact: true })
    .click();
  await expect(page.locator(".task-progress-row .task-status")).toHaveText(
    "succeeded · 0",
  );
  expect(requests).toEqual(["Inclusive language"]);
});

test("parallel tasks retain successes and retry only a failed task", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "Review Tasks", exact: true }).click();
  await page.getByLabel("Parallel task limit").selectOption("2");
  await page.getByRole("button", { name: "Save settings" }).click();
  const received: string[] = [];
  const releaseFirstPair: (() => void)[] = [];
  let grammarFailed = false;
  await page.route("**/api/llm/review", async (route) => {
    const payload = route.request().postDataJSON();
    const task = payload.task.id;
    received.push(task);
    if (received.length <= 2)
      await new Promise<void>((resolve) => {
        releaseFirstPair.push(resolve);
        if (releaseFirstPair.length === 2)
          releaseFirstPair.forEach((release) => release());
      });
    if (task === "grammar" && !grammarFailed) {
      grammarFailed = true;
      await route.fulfill({ json: { error: "Temporary provider failure" } });
      return;
    }
    await route.fulfill({
      json: {
        model: "ollama/llama3.2",
        findings:
          task === "accuracy"
            ? [
                {
                  kind: "content",
                  severity: "warning",
                  side: "es",
                  line: 8,
                  title: "Translate the introduction",
                  detail: "This paragraph is in English.",
                },
              ]
            : [],
      },
    });
  });
  await page
    .getByRole("button", { name: "Review with LLM", exact: true })
    .click();
  await expect(page.locator(".task-status.failed")).toHaveCount(1);
  await expect(page.locator(".task-status.succeeded")).toHaveCount(
    defaultTasks.length - 1,
  );
  await expect(page.locator(".llm-badge")).toHaveCount(1);
  await expect(
    page.locator(".task-progress-row").filter({ hasText: "Spanish grammar" }),
  ).toContainText("Temporary provider failure");
  await page
    .getByRole("button", { name: "Run Spanish grammar", exact: true })
    .click();
  await expect(page.locator(".task-status.succeeded")).toHaveCount(
    defaultTasks.length,
  );
  await expect(page.locator(".task-status.failed")).toHaveCount(0);
  await expect(page.locator(".llm-badge")).toHaveCount(1);
  expect(received.filter((task) => task === "grammar")).toHaveLength(2);
  expect(received.filter((task) => task === "accuracy")).toHaveLength(1);
});

test("settings default to Ollama and persist configuration without API keys", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("LLM provider", { exact: true })).toHaveValue(
    "ollama",
  );
  await expect(page.getByLabel("LLM model", { exact: true })).toHaveValue(
    "llama3.2",
  );
  await expect(page.getByLabel("LLM API endpoint")).toHaveValue(
    "http://127.0.0.1:11434",
  );
  await page.getByLabel("LLM provider", { exact: true }).selectOption("openai");
  await page.getByLabel("LLM API key").fill("test-session-key-not-real");
  await page.getByRole("button", { name: "Save settings" }).click();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("k8s-docs-review.llm-settings"),
    ),
  ).not.toContain("test-session-key-not-real");
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("LLM provider", { exact: true })).toHaveValue(
    "openai",
  );
  await expect(page.getByLabel("LLM API key")).toHaveValue("");
});

test("tests the configured provider and displays a connection failure", async ({
  page,
}) => {
  await page.route("**/api/llm/review", async (route) => {
    const payload = route.request().postDataJSON();
    expect(payload.action).toBe("test");
    expect(payload.settings.provider).toBe("ollama");
    expect(payload.english).toBeUndefined();
    await route.fulfill({
      json: { error: "The configured Ollama model is not installed." },
    });
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "model is not installed",
  );
  await expect(
    page.getByRole("button", { name: "Save settings" }),
  ).toBeEnabled();
});

test("adds labelled LLM findings and removes them after document edits", async ({
  page,
}) => {
  await page.route("**/api/llm/review", async (route) => {
    const payload = route.request().postDataJSON();
    expect(payload.action).toBe("review");
    expect(payload.english).toContain("A Deployment manages");
    expect(payload.spanish).toContain("Necesitas un clúster");
    await route.fulfill({
      json: {
        model: "ollama/llama3.2",
        findings:
          payload.task.id === "accuracy"
            ? [
                {
                  kind: "content",
                  severity: "warning",
                  side: "es",
                  line: 8,
                  title: "Translate the introduction",
                  detail: "The introductory paragraph is still in English.",
                },
              ]
            : [],
      },
    });
  });
  await page
    .getByRole("button", { name: "Review with LLM", exact: true })
    .click();
  await expect(page.locator(".llm-badge")).toHaveCount(1);
  await page
    .locator(".finding-row")
    .filter({ hasText: "Translate the introduction" })
    .click();
  await expect(page.locator(".spanish-pane .cm-activeLine")).toContainText(
    "A Deployment manages",
  );
  await page.getByLabel("Spanish translation", { exact: true }).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("\n\nTexto nuevo.");
  await expect(page.locator(".llm-badge")).toHaveCount(0);
});

test("local LLM bridge rejects cross-origin requests and non-Python commands", async ({
  request,
}) => {
  const crossOrigin = await request.post("/api/llm/review", {
    headers: { Origin: "https://untrusted.example.invalid" },
    data: { action: "test" },
  });
  expect(crossOrigin.status()).toBe(403);
  const invalidExecutable = await request.post("/api/llm/review", {
    headers: { Origin: "http://127.0.0.1:5173" },
    data: { settings: { pythonExecutable: "sh" } },
  });
  expect(invalidExecutable.status()).toBe(400);
});

test("renders the comparison and filters findings", async ({ page }) => {
  await expect(page.locator(".cm-editor")).toHaveCount(2);
  await expect(page.locator(".finding-row")).toHaveCount(6);
  await page.getByRole("tab", { name: "References" }).click();
  await expect(page.locator(".finding-row")).toHaveCount(2);
  await page.getByLabel("Filter by severity").selectOption("error");
  await expect(page.locator(".finding-row")).toHaveCount(1);
  await page.locator(".finding-row").click();
  await expect(page.locator(".spanish-pane .cm-activeLine")).toContainText(
    "guía de escalado",
  );
});

test("Spanish drafts survive switching documents and update checks", async ({
  page,
}) => {
  const spanish = page.getByLabel("Spanish translation", { exact: true });
  await spanish.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("\n\nBorrador local.");
  await expect(page.locator(".pane-tag.editable")).toHaveText("MODIFIED");
  await page
    .getByTitle("content/es/docs/concepts/workloads/pods.md", { exact: true })
    .click();
  await expect(page.locator(".findings-empty")).toBeVisible();
  await page
    .getByTitle("content/es/docs/concepts/workloads/deployments.md", {
      exact: true,
    })
    .click();
  await spanish.click();
  await page.keyboard.press("ControlOrMeta+End");
  await expect(spanish).toContainText("Borrador local.");
  await expect(
    page.getByLabel("English source", { exact: true }),
  ).toHaveAttribute("contenteditable", "false");
});

test("review export is removed while Spanish translation download remains available", async ({
  page,
}) => {
  await expect(
    page.getByRole("button", { name: "Export review", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByTitle("Export Markdown report")).toHaveCount(0);
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download Spanish translation", exact: true })
    .click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("deployments.md");
  const stream = await download.createReadStream();
  let content = "";
  for await (const chunk of stream!) content += chunk.toString();
  expect(content).toContain("Necesitas un clúster");
  expect(content).not.toContain("# Kubernetes Translation Review");
});

test("loads a PR and lists only changed Spanish files", async ({ page, context }) => {
  const sha = "a".repeat(40);
  const requests: string[] = [];
  await expect(page.locator(".brand span")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open PR on GitHub" })).toBeDisabled();
  await page.route(
    "https://api.github.com/repos/kubernetes/website/**",
    async (route) => {
      const url = new URL(route.request().url());
      requests.push(url.pathname);
      if (url.pathname.endsWith("/labels") || url.pathname.endsWith("/issues") || url.pathname.endsWith("/contents/content")) return route.fallback();
      if (url.pathname.endsWith("/pulls/42"))
        return route.fulfill({
          json: { title: "Update Spanish docs", head: { sha } },
        });
      if (url.pathname.endsWith("/pulls/42/files"))
        return route.fulfill({
          json: [
            { filename: "content/es/docs/page.md", status: "modified" },
            { filename: "content/es/docs/deleted.md", status: "removed" },
            { filename: "content/fr/docs/page.md", status: "modified" },
          ],
        });
      if (url.pathname.includes("/git/trees/"))
        return route.fulfill({
          json: {
            truncated: false,
            tree: [
              "content/en/docs/page.md",
              "content/es/docs/page.md",
              "content/en/docs/pods.md",
              "content/es/docs/unrelated.md",
            ].map((path) => ({ path, type: "blob" })),
          },
        });
      expect(url.searchParams.get("ref")).toBe(sha);
      return route.fulfill({
        body: url.pathname.includes("/content/es/")
          ? "# Resumen\n\n[Pod](/docs/pods/)\n\n[Error](/docs/missing/)"
          : "# Overview\n\nSource text.",
      });
    },
  );
  await expect(page.getByRole("combobox", { name: "Language", exact: true })).toHaveValue("es");
  await page.getByRole("combobox", { name: "Pull request", exact: true }).selectOption("42");
  await expect(page.locator(".workspace-name")).toContainText("PR #42");
  await expect(page.locator(".file-item")).toHaveCount(1);
  await expect(page.locator(".pr-context")).toContainText(
    "Update Spanish docs",
  );
  await context.route("https://github.com/kubernetes/website/pull/42", (route) =>
    route.fulfill({ contentType: "text/html", body: "<h1>Pull request 42</h1>" }),
  );
  const pendingPR = context.waitForEvent("page");
  await page.getByRole("button", { name: "Open PR on GitHub" }).click();
  const githubPR = await pendingPR;
  await githubPR.waitForLoadState("domcontentloaded");
  expect(githubPR.url()).toBe("https://github.com/kubernetes/website/pull/42");
  await githubPR.close();
  await page.getByRole("tab", { name: "References" }).click();
  await expect(page.locator(".finding-row")).toHaveCount(1);
  await expect(page.locator(".finding-row")).toContainText("/docs/missing/");
  await page.getByRole("button", { name: "Refresh pull requests" }).click();
  await page.getByRole("combobox", { name: "Pull request", exact: true }).selectOption("42");
  await expect(page.getByRole("combobox", { name: "Pull request", exact: true })).toBeEnabled();
  expect(requests.filter((path) => path.includes("/contents/content/")).length).toBe(2);
  expect(requests.filter((path) => path.includes("/git/trees/")).length).toBe(
    1,
  );
});

test("preserves the current workspace on GitHub errors and can refresh the PR list", async ({
  page,
}) => {
  await expect(page.getByRole("button", { name: "Open files" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open repository" }),
  ).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Pull request", exact: true })).toHaveCount(0);
  await page.route(
    "https://api.github.com/repos/kubernetes/website/**",
    (route) =>
      route.fulfill({ status: 429, json: { message: "API rate limit" } }),
  );
  await page.getByRole("combobox", { name: "Pull request", exact: true }).selectOption("42");
  await expect(page.getByRole("alert")).toContainText("public API limit");
  await expect(page.locator(".workspace-name")).toContainText(
    "Example workspace",
  );
  await page.getByRole("button", { name: "Refresh pull requests" }).click();
  await expect(page.getByRole("combobox", { name: "Pull request", exact: true })).toBeDisabled();
  await expect(page.getByRole("combobox", { name: "Pull request", exact: true })).toContainText("Could not load pull requests");
});

test("language selection paginates labelled PRs and loads their translated files", async ({ page }) => {
  const sha = "b".repeat(40);
  const pages: string[] = [];
  await page.route("https://api.github.com/repos/kubernetes/website/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/labels") || url.pathname.endsWith("/contents/content")) return route.fallback();
    if (url.pathname.endsWith("/issues")) {
      if (url.searchParams.get("labels") !== "language/fr") return route.fallback();
      expect(url.searchParams.get("state")).toBe("open");
      expect(url.searchParams.get("labels")).toBe("language/fr");
      pages.push(url.searchParams.get("page")!);
      return route.fulfill({ json: url.searchParams.get("page") === "1"
        ? Array.from({ length: 100 }, (_, index) => ({ number: index + 100, title: `French update ${index}`, pull_request: {} }))
        : [{ number: 43, title: "French documentation", pull_request: {} }, { number: 999, title: "Not a pull request" }] });
    }
    if (url.pathname.endsWith("/pulls/43")) return route.fulfill({ json: { title: "French documentation", head: { sha } } });
    if (url.pathname.endsWith("/pulls/43/files")) return route.fulfill({ json: [
      { filename: "content/fr/docs/page.md", status: "modified" },
      { filename: "content/fr/docs/second.md", status: "added" },
      { filename: "content/fr/docs/deleted.md", status: "removed" },
      { filename: "content/es/docs/page.md", status: "modified" },
    ] });
    if (url.pathname.includes("/git/trees/")) return route.fulfill({ json: { truncated: false, tree: [
      "content/fr/docs/page.md", "content/fr/docs/second.md", "content/en/docs/page.md", "content/en/docs/second.md",
    ].map((path) => ({ path, type: "blob" })) } });
    expect(url.searchParams.get("ref")).toBe(sha);
    return route.fulfill({ body: url.pathname.includes("/content/fr/") ? "# Bonjour\n\n[Guide](./second/)" : "# Source" });
  });
  await expect(page.getByRole("combobox", { name: "Language", exact: true })).toContainText("French");
  await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("fr");
  const requests = page.getByRole("combobox", { name: "Pull request", exact: true });
  await expect(requests).toBeEnabled();
  await expect(requests.locator("option")).toHaveCount(102);
  expect(pages).toEqual(["1", "2"]);
  await requests.selectOption("43");
  await expect(page.locator(".workspace-name")).toContainText("PR #43");
  await expect(page.getByLabel("French files").locator(".file-item")).toHaveCount(2);
  await expect(page.getByLabel("French translation", { exact: true })).toContainText("Bonjour");
  await expect(page.getByLabel("English source", { exact: true })).toContainText("Source");
  await expect(page.getByLabel("Review file").locator("option")).toHaveCount(2);
  await page.route("**/api/llm/review", async (route) => {
    const payload = route.request().postDataJSON();
    expect(payload.language).toBe("fr");
    if (payload.task.id === "grammar") {
      expect(payload.task.instructions).toContain("French spelling");
      expect(payload.task.instructions).not.toContain("tú");
    }
    return route.fulfill({ json: { model: "ollama/llama3.2", findings: [] } });
  });
  await page.getByRole("button", { name: "Review with LLM", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("LLM tasks complete");
  await page.getByLabel("French files").getByRole("button", { name: "second.md" }).click();
  await expect(page.locator(".file-item.active")).toContainText("second.md");
});

test("empty languages and stale list responses never replace the current PR options", async ({ page }) => {
  let release: (() => void) | undefined;
  let started: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => { started = resolve; });
  await page.route("**/issues?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("labels") === "language/fr") {
      started!();
      await new Promise<void>((resolve) => { release = resolve; });
      return route.fulfill({ json: [{ number: 43, title: "Stale French PR", pull_request: {} }] });
    }
    return route.fulfill({ json: [] });
  });
  await page.getByLabel("Language", { exact: true }).selectOption("fr");
  await pending;
  await page.getByLabel("Language", { exact: true }).selectOption("zh-cn");
  await expect(page.getByLabel("Pull request", { exact: true })).toContainText("No open pull requests");
  release!();
  await expect(page.getByLabel("Pull request", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Pull request", { exact: true }).locator("option")).toHaveCount(1);
  await expect(page.locator(".workspace-name")).toContainText("Example workspace");
});

test("selecting a PR keeps unsaved edits when replacement is cancelled", async ({ page }) => {
  await page.getByLabel("Spanish translation", { exact: true }).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("\n\nDraft to preserve.");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByLabel("Pull request", { exact: true }).selectOption("42");
  await expect(page.locator(".workspace-name")).toContainText("Example workspace");
  await expect(page.getByLabel("Spanish translation", { exact: true })).toContainText("Draft to preserve.");
  await expect(page.getByLabel("Pull request", { exact: true })).toHaveValue("");
});

test("language options match supported folders and map regional locales to GitHub labels", async ({ page }) => {
  const labels: string[] = [];
  await page.route("**/issues?**", async (route) => {
    labels.push(new URL(route.request().url()).searchParams.get("labels")!);
    return route.fulfill({ json: [] });
  });
  const language = page.getByLabel("Language", { exact: true });
  await expect(language.locator("option")).toHaveCount(4);
  await expect(language.locator('option[value="en"], option[value="ar"]')).toHaveCount(0);
  await language.selectOption("zh-cn");
  await expect(page.getByLabel("Pull request", { exact: true })).toContainText("No open pull requests");
  await language.selectOption("pt-br");
  await expect(page.getByLabel("Pull request", { exact: true })).toContainText("No open pull requests");
  expect(labels).toContain("language/zh");
  expect(labels).toContain("language/pt");
});

test("desktop and narrow layouts have visible editors and no page overflow", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1440, height: 940 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator(".cm-editor").first()).toBeVisible();
    await expect(page.locator(".cm-editor").last()).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const toolbar = await page.locator(".document-toolbar").boundingBox();
    const comparison = await page.locator(".comparison").boundingBox();
    const findings = await page.locator(".findings").boundingBox();
    expect(comparison!.y).toBeGreaterThanOrEqual(toolbar!.y + toolbar!.height);
    expect(findings!.y).toBeGreaterThanOrEqual(
      comparison!.y + comparison!.height - 1,
    );
    await page.screenshot({
      path: `test-results/review-${viewport.width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const settings = page.getByRole("dialog");
    await expect(settings).toBeVisible();
    const bounds = await settings.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    await page.screenshot({
      path: `test-results/settings-${viewport.width}.png`,
      fullPage: true,
    });
    await page.getByRole("tab", { name: "Review Tasks", exact: true }).click();
    await expect(page.getByLabel("Parallel task limit")).toBeVisible();
    await page.screenshot({
      path: `test-results/task-settings-${viewport.width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Close settings" }).click();
  }
});
