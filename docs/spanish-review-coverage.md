---
title: Spanish review history coverage
parent: Reference
nav_order: 2
---

# Spanish review history coverage

This reference records the 2026-10-23 audit snapshot.
It is not a live count of Kubernetes reviews.
For current application behavior, see the [user guide](user-guide.md)
and [review design](explanations/how-review-works.md).

## Corpus

Snapshot collected on 2026-10-23 from the
[closed Spanish PR filter](https://github.com/kubernetes/website/pulls?q=is%3Apr+state%3Aclosed+label%3Alanguage%2Fes).
The collector exhausted the PR connection and every accessible discussion,
review,
review-thread,
and thread-comment connection.

- Closed or merged PRs: **727 of 727**.
- Records: **11,416**,
  comprising 5,195 discussion comments,
  2,154 review summaries,
  and 4,067 inline comments or replies.
- Non-author records after known automation filtering: **5,830**.
- Records on Spanish paths or in general PR discussion: **5,583**.
- Inline records outside `content/es/` excluded from the localization rubric: **247**.
- PR creation dates range from 2019-03-30 through 2026-10-19.

Machine-readable counts,
the snapshot timestamp,
and a SHA-256 corpus fingerprint are in
[spanish-review-history-summary.json](spanish-review-history-summary.json).
Raw records and the complete keyword index remain under ignored `.cache/` paths.
The audit does not recover deleted or inaccessible comments.

## Method

Every eligible record was indexed using non-exclusive theme keywords.
These are retrieval aids,
not manually verified counts of distinct defects.
One comment can match several themes,
and a suggestion block may supply a rewrite without explaining its rationale.
The index retains unmatched records;
1,271 records do not match the keyword rules.
Representative comments across the historical range,
explicit review rationales,
and residual unmatched feedback were inspected to ground the coverage matrix.

This is a complete retrieval audit,
not a claim that a human independently adjudicated every historical correction.
Historical suggestions can conflict,
be subjective,
or reflect superseded project conventions.
They are evidence for review concerns,
not unconditional rules for current content.

## Coverage matrix

| Reviewer Concern                                         | Historical Evidence                                                                                                                                                                                                                | App Coverage                                                                                                                                                                             | Boundary                                                                                                           |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Natural wording and translation meaning                  | [Rare wording versus clearer phrasing, PR 14356](https://github.com/kubernetes/website/pull/14356#discussion_r288223842), [unnatural phrasing, PR 13881](https://github.com/kubernetes/website/pull/13881#discussion_r276934112)   | Accuracy task explicitly checks natural Spanish, literal calques, negation, and source meaning.                                                                                          | LLM-assisted; regional alternatives are not automatically wrong.                                                   |
| Spelling, accents, articles, agreement, punctuation      | [Missing article, PR 13543](https://github.com/kubernetes/website/pull/13543#discussion_r270843079), [grammar review, PR 50703](https://github.com/kubernetes/website/pull/50703#pullrequestreview-2842530341)                     | Grammar task explicitly covers these concerns, including inverted punctuation and capitalization.                                                                                        | LLM-assisted; not a complete Spanish dictionary or grammar engine.                                                 |
| Consistent informal second person                        | [Prefer tú over usted, PR 45368](https://github.com/kubernetes/website/pull/45368#discussion_r1506567824), [imperative form, PR 45629](https://github.com/kubernetes/website/pull/45629#discussion_r1542194637)                    | Grammar task names the preferred register and gives concrete imperative examples while excluding quotations and identifiers.                                                             | Linguistic judgement remains reviewable.                                                                           |
| API object names, capitalization, technical terminology  | [IngressClass case, PR 44956](https://github.com/kubernetes/website/pull/44956#discussion_r1481963496), [Service object versus generic service, PR 57529](https://github.com/kubernetes/website/pull/57529#discussion_r4010918997) | Terminology and technical tasks distinguish API kinds from generic prose and preserve identifiers, enum values, flags, and case.                                                         | Generalized casing and terminology checks are LLM-assisted, not deterministic proof.                               |
| Missing, duplicated, untranslated, or shifted content    | [Missing paragraphs, PR 47204](https://github.com/kubernetes/website/pull/47204#pullrequestreview-2205457029)                                                                                                                      | Existing section/paragraph counts plus a repeated-adjacent-paragraph warning; completeness task checks source-backed omissions, ordering, lists, metadata text, and visible link labels. | Paragraph counts alone do not prove semantic omissions; unanchored ordering is uncertain.                          |
| Page titles and frontmatter                              | [Translated title, PR 56621](https://github.com/kubernetes/website/pull/56621#discussion_r3653755295), [local reviewer lists, PR 29202](https://github.com/kubernetes/website/pull/29202#pullrequestreview-731046891)              | Deterministic YAML syntax/mapping checks and informational rendering-metadata differences; Markdown/metadata task checks translated titles and descriptions.                             | Local reviewer lists may differ; no blanket historical title-case rule is imposed.                                 |
| Anchors and prerequisite headings                        | [Missing source anchor, PR 47204](https://github.com/kubernetes/website/pull/47204#discussion_r1725990232), [missing prerequisites helper, PR 45347](https://github.com/kubernetes/website/pull/45347#discussion_r1504620834)      | Deterministic checks for absent explicit source IDs and changed/missing Hugo heading keys; existing local anchor resolution.                                                             | Incoming-link repair and intentional localized IDs require judgement.                                              |
| Glossary shortcodes and note/warning closures            | [Glossary tooltip, PR 58114](https://github.com/kubernetes/website/pull/58114#discussion_r4304341300), [inconsistent note closures, PR 55917](https://github.com/kubernetes/website/pull/55917#discussion_r3430727688)             | Deterministic matching of glossary term IDs and include contracts, delimiter checks, and block-close checks; visible tooltip text may change.                                            | This is conservative shortcode inspection, not a full Hugo parser.                                                 |
| Markdown rendering, nested fences, indentation, emphasis | [PowerShell rendering issue, PR 25481](https://github.com/kubernetes/website/pull/25481#discussion_r544325044)                                                                                                                     | Markdown AST parsing, existing fenced-code comparison, and the Markdown/metadata task.                                                                                                   | Actual rendering, tables, CSS, and theme behavior still need a rendered preview or build.                          |
| Localized labels and broken references                   | [Translate visible link text, PR 56911](https://github.com/kubernetes/website/pull/56911#discussion_r3788602245)                                                                                                                   | Completeness task reviews visible labels; deterministic local targets and explicit published Kubernetes page checks remain available.                                                    | Other hosts and published anchor fragments are not fetched or verified.                                            |
| Versions, deprecation, security, technical behavior      | [Deprecation wording, PR 38888](https://github.com/kubernetes/website/pull/38888#discussion_r1081555314)                                                                                                                           | Technical and completeness tasks require evidence from the supplied English revision; exact fenced code is compared deterministically.                                                   | No claim of cluster execution, current-release expertise, or external fact verification.                           |
| PR language, one-localization scope, commit hygiene      | [English PR title/body, PR 55907](https://github.com/kubernetes/website/pull/55907#issuecomment-4533177273), [one localization per PR, PR 55869](https://github.com/kubernetes/website/pull/55869#issuecomment-4522968503)         | Manual contribution checklist below.                                                                                                                                                     | The app does not analyze every commit, assess PR-description language, or restrict every finding to changed lines. |
| CI, CLA, approvals, and preview freshness                | [Workflow/CLA feedback, PR 50151](https://github.com/kubernetes/website/pull/50151#issuecomment-2739677750), [stale preview head, PR 25920](https://github.com/kubernetes/website/pull/25920#issuecomment-798917501)               | Source documents are pinned to the requested PR head; manual checks cover the rest.                                                                                                      | Source revision pinning is not proof that Netlify rendered that revision or that merge requirements passed.        |

## Changes made

Added deterministic checks for YAML frontmatter,
rendering-metadata differences,
explicit source anchor IDs,
Hugo heading/glossary/include contracts,
shortcode delimiter and block-close problems,
and adjacent duplicate paragraphs.
Code examples and HTML comments are excluded from shortcode contract scanning.

Expanded the five existing LLM prompts with the historical concerns above and
added the configurable **Markdown and metadata** task.
Untouched legacy prompt text is upgraded;
custom tasks and edited prompts are preserved.
If the entire original rubric is still present and untouched,
the new task is added without enabling a previously disabled rubric.
Use **Restore defaults** to explicitly replace a customized rubric.

Regression tests use the observed review patterns,
including missing `container-probes` IDs,
missing `heading "prerequisites"` helpers,
translated glossary text versus changed `term_id` values,
metadata changes,
unclosed notes,
and duplicated prose.

## Manual review checklist

- Verify rendered Hugo/Netlify output and confirm the preview SHA matches the PR head.
- Verify tables, nested lists, code-fence presentation, navigation, and theme-specific behavior.
- Check PR title/body language, one-localization scope, commit history, and source-version intent.
- Check CLA, required CI, authorized reviewers, approvals, and release deadlines in GitHub.
- Confirm translator expertise and project contribution policy through human review; do not infer identity or native-language status using AI.
- Review findings against the contributor diff and existing discussions before posting; the app currently reviews complete changed documents and does not suppress previously discussed findings.
- Use specialized review for legacy HTML, repository configuration, OWNERS files, and non-documentation changes outside the Markdown review surface.

These are explicitly not automated pass/fail checks.
AI suggestions cannot guarantee that every historical suggestion will be caught.

## Reproduce

Requires Python and an authenticated GitHub CLI with read access to the public repository.

```sh
python3 scripts/audit_review_history.py --summary docs/spanish-review-history-summary.json
```

The collector resumes `.cache/spanish-review-history.json` checkpoints.
For a fresh snapshot,
choose a different `--out` path.
It refuses incomplete nested counts and records API failures rather than
silently claiming complete coverage.
No GitHub credentials are written to the corpus or summary.
