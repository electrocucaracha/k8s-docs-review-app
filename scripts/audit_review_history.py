import argparse
import datetime
import json
import collections
import hashlib
import re
from pathlib import Path
import subprocess


SCOPE = "repo:kubernetes/website is:pr is:closed label:language/es"
AUTOMATION_ACCOUNTS = {"k8s-ci-robot", "k8s-merge-robot", "k8s-pr-robot", "k8s-triage-robot", "k8sio-netlify-preview-bot", "fejta-bot"}
THEMES = {
    "grammar": r"tilde|acent|ortograf|concord|plural|singular|typo|errata|spelling|gram.ti|puntuaci|preposici",
    "natural-wording": r"suena|natural|literal|entiende|poco.com.n|RAE|palabra.m.s.adecuada",
    "register": r"usted|tuteo|segunda persona|forma.{0,8}tú|impersonal|voz activa",
    "terminology": r"terminolog|t.rmino|glosario|glossary|PascalCase|camelCase|IngressClass|container.runtime|control.plane",
    "links-and-anchors": r"anchor|ancla|enlace|broken.link|Hugo reference|term_id|slug|alias",
    "metadata": r"front.?matter|content_type|description:|title:|weight:|toc.hide|metadata",
    "rendering": r"render|markdown|shortcode|backtick|indent|sangr|negrita|cursiva|code.block|bloque.de.c.digo",
    "completeness-and-source": r"missing|omit|falta|duplic|version|obsolet|deprecat|original|English.source|untranslated",
    "workflow-and-approval": r"\bCLA\b|rebase|commit|squash|conflict|unrelated|one.localization|per.language|PR.title|\blgtm\b|\bapprove\b|Netlify|preview",
    "suggested-rewrite": r"```suggestion",
}
PAGE = "pageInfo { hasNextPage endCursor }"
AUTHOR = "author { login __typename }"
DISCUSSION = f"totalCount {PAGE} nodes {{ {AUTHOR} body url createdAt }}"
REVIEWS = f"totalCount {PAGE} nodes {{ {AUTHOR} body url createdAt state }}"
INLINE = f"totalCount {PAGE} nodes {{ {AUTHOR} body url createdAt path line originalLine diffHunk }}"
THREADS = f"{PAGE} nodes {{ id path isResolved comments(first:50) {{ {INLINE} }} }}"
QUERY = f"""query($cursor:String) {{
  repository(owner:"kubernetes",name:"website") {{
    pullRequests(first:25,after:$cursor,labels:["language/es"],states:[CLOSED,MERGED],orderBy:{{field:CREATED_AT,direction:ASC}}) {{
      totalCount {PAGE}
      nodes {{ id number title url createdAt closedAt {AUTHOR}
        comments(first:100) {{ {DISCUSSION} }}
        reviews(first:100) {{ {REVIEWS} }}
        reviewThreads(first:50) {{ {THREADS} }}
      }}
    }}
  }}
  rateLimit {{ cost remaining resetAt }}
}}"""


def graphql(query, **variables):
    command = ["gh", "api", "--hostname", "github.com", "graphql", "-f", f"query={query}"]
    for key, value in variables.items():
        if value is not None:
            command.extend(["-F", f"{key}={value}"])
    result = subprocess.run(command, capture_output=True, text=True, timeout=120, check=False)
    if result.returncode:
        raise RuntimeError(f"GitHub query failed: {result.stderr[:1500]}")
    payload = json.loads(result.stdout)
    if payload.get("errors"):
        raise RuntimeError(json.dumps(payload["errors"], ensure_ascii=False)[:1500])
    return payload["data"]


def finish_connection(owner_id, owner_type, field, selection, connection):
    while connection["pageInfo"]["hasNextPage"]:
        query = f"""query($id:ID!,$cursor:String!) {{ node(id:$id) {{ ... on {owner_type} {{ {field}(first:100,after:$cursor) {{ {selection} }} }} }} }}"""
        following = graphql(query, id=owner_id, cursor=connection["pageInfo"]["endCursor"])["node"][field]
        connection["nodes"].extend(following["nodes"])
        connection["pageInfo"] = following["pageInfo"]
    expected = connection.get("totalCount")
    if expected is not None and expected != len(connection["nodes"]):
        raise RuntimeError(f"Incomplete {field}: expected {expected}, got {len(connection['nodes'])}")


def complete_pull_request(pull_request):
    for field, selection in [("comments", DISCUSSION), ("reviews", REVIEWS), ("reviewThreads", THREADS)]:
        finish_connection(pull_request["id"], "PullRequest", field, selection, pull_request[field])
    for thread in pull_request["reviewThreads"]["nodes"]:
        finish_connection(thread["id"], "PullRequestReviewThread", "comments", INLINE, thread["comments"])


def records(history):
    for pull_request in history["pullRequests"]:
        author = (pull_request.get("author") or {}).get("login")
        sources = [("discussion", pull_request["comments"]["nodes"]), ("review", pull_request["reviews"]["nodes"])]
        sources.extend(("inline", thread["comments"]["nodes"]) for thread in pull_request["reviewThreads"]["nodes"])
        for source, comments in sources:
            for comment in comments:
                identity = comment.get("author") or {}
                yield {
                    "pr": pull_request["number"], "prTitle": pull_request["title"], "prAuthor": author,
                    "source": source, "reviewer": identity.get("login"),
                    "isBot": identity.get("__typename") == "Bot" or identity.get("login", "").endswith("[bot]") or identity.get("login") in AUTOMATION_ACCOUNTS,
                    "isAuthor": identity.get("login") == author,
                    **{key: comment.get(key) for key in ("body", "url", "createdAt", "path", "line", "originalLine", "diffHunk")},
                }


def collect(output, max_pages=None):
    if output.exists():
        history = json.loads(output.read_text())
        if history.get("scope") != SCOPE:
            raise RuntimeError("Existing history uses a different scope.")
    else:
        history = {"scope": SCOPE, "startedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "complete": False, "cursor": None, "pullRequests": []}
    if history["complete"]:
        return history
    output.parent.mkdir(parents=True, exist_ok=True)
    pages = 0
    while True:
        data = graphql(QUERY, cursor=history["cursor"])
        page = data["repository"]["pullRequests"]
        for pull_request in page["nodes"]:
            complete_pull_request(pull_request)
        history["pullRequests"].extend(page["nodes"])
        history.update({"totalPrs": page["totalCount"], "cursor": page["pageInfo"]["endCursor"], "rateLimit": data["rateLimit"], "complete": not page["pageInfo"]["hasNextPage"], "updatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat()})
        if history["complete"] and len(history["pullRequests"]) != history["totalPrs"]:
            history["complete"] = False
            raise RuntimeError("PR count changed during collection; start a new snapshot.")
        output.write_text(json.dumps(history, ensure_ascii=False), encoding="utf-8")
        pages += 1
        print(f"Collected {len(history['pullRequests'])}/{history['totalPrs']} PRs; GraphQL budget {data['rateLimit']['remaining']}", flush=True)
        if history["complete"] or (max_pages is not None and pages >= max_pages):
            return history
        if data["rateLimit"]["remaining"] < 150:
            raise RuntimeError("API budget is low. Resume from the saved checkpoint after reset.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=Path(".cache/spanish-review-history.json"))
    parser.add_argument("--max-pages", type=int)
    parser.add_argument("--summary", type=Path)
    arguments = parser.parse_args()
    history = collect(arguments.out, arguments.max_pages)
    comments = list(records(history))
    reviewers = [comment for comment in comments if not comment["isBot"] and not comment["isAuthor"] and comment["body"]]
    eligible = [comment for comment in reviewers if not comment["path"] or comment["path"].startswith("content/es/")]
    assignments = [{"url": comment["url"], "pr": comment["pr"], "themes": [name for name, pattern in THEMES.items() if re.search(pattern, comment["body"], re.I)]} for comment in eligible]
    summary = {
        "scope": SCOPE, "complete": history["complete"], "collectedAt": history["updatedAt"],
        "prs": len(history["pullRequests"]), "expectedPrs": history["totalPrs"], "records": len(comments),
        "humanNonAuthorRecords": len(reviewers), "spanishOrGeneralReviewRecords": len(eligible),
        "excludedNonSpanishInlineRecords": len(reviewers) - len(eligible),
        "sources": dict(collections.Counter(comment["source"] for comment in comments)),
        "firstCreatedAt": history["pullRequests"][0]["createdAt"], "lastCreatedAt": history["pullRequests"][-1]["createdAt"],
        "corpusSha256": hashlib.sha256(arguments.out.read_bytes()).hexdigest(),
        "themeMethod": "Non-exclusive regex indexing of every eligible record; counts are keyword matches, not manually verified issue frequencies. Suggested rewrites may lack explicit rationale. Unmatched records are retained in the index.",
        "themeKeywordMatches": dict(collections.Counter(theme for item in assignments for theme in item["themes"])),
        "unmatchedRecords": sum(not item["themes"] for item in assignments),
    }
    if arguments.summary:
        arguments.summary.parent.mkdir(parents=True, exist_ok=True)
        arguments.summary.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        index = arguments.out.with_name("spanish-review-history-index.json")
        index.write_text(json.dumps(assignments, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()