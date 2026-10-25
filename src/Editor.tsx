import { useEffect, useEffectEvent, useImperativeHandle, useRef } from "react";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import type { Text } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  drawSelection,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import { lintGutter, setDiagnostics } from "@codemirror/lint";
import type { Finding } from "./review";
import type { PullRequestReviewComment } from "./pullRequest";
import type { LineDiff } from "./lineDiff";

export type EditorHandle = {
  jump: (line: number, focus?: boolean) => void;
  lineCount: () => number;
};
type Props = {
  ref: React.Ref<EditorHandle>;
  content: string;
  readOnly?: boolean;
  label: string;
  findings: Finding[];
  reviewComments: PullRequestReviewComment[];
  lineDiff?: LineDiff;
  diffSide?: "left" | "right";
  onChange?: (content: string) => void;
  onScroll: (line: number) => void;
};

class ReviewCommentWidget extends WidgetType {
  private readonly comments: PullRequestReviewComment[];

  constructor(comments: PullRequestReviewComment[]) {
    super();
    this.comments = comments;
  }

  eq(other: ReviewCommentWidget) {
    return this.comments.length === other.comments.length &&
      this.comments.every((comment, index) =>
        comment.id === other.comments[index].id &&
        comment.body === other.comments[index].body &&
        comment.author === other.comments[index].author &&
        comment.url === other.comments[index].url,
      );
  }

  toDOM() {
    const thread = document.createElement("div");
    thread.className = "review-comment-thread";
    thread.setAttribute("aria-label", "Pull request review comments");
    for (const comment of this.comments) {
      const item = document.createElement("article");
      const link = document.createElement("a");
      link.href = comment.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = `${comment.author} · PR review`;
      const body = document.createElement("p");
      body.textContent = comment.body;
      item.append(link, body);
      thread.append(item);
    }
    return thread;
  }
}

function commentDecorations(doc: Text, comments: PullRequestReviewComment[]) {
  const lines = new Map<number, PullRequestReviewComment[]>();
  for (const comment of comments) {
    if (!comment.line || comment.line < 1 || comment.line > doc.lines) continue;
    lines.set(comment.line, [...(lines.get(comment.line) ?? []), comment]);
  }
  return Decoration.set([...lines].map(([number, group]) =>
    Decoration.widget({
      widget: new ReviewCommentWidget(group),
      block: true,
      side: 1,
    }).range(doc.line(number).to),
  ), true);
}

const setReviewComments = StateEffect.define<PullRequestReviewComment[]>();
const reviewCommentsField = StateField.define({
  create: (state) => commentDecorations(state.doc, []),
  update: (decorations, transaction) => {
    let next = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setReviewComments))
        next = commentDecorations(transaction.newDoc, effect.value);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

type DiffDecorations = { diff: LineDiff; side: "left" | "right" };
const setDiffDecorations = StateEffect.define<DiffDecorations>();
function diffDecorations(doc: Text, { diff, side }: DiffDecorations) {
  const changes = [
    ...(side === "left" ? diff.removed.map((line) => [line, "diff-removed"] as const) : []),
    ...(side === "right" ? diff.added.map((line) => [line, "diff-added"] as const) : []),
    ...diff.replaced.map((line) => [line, "diff-replaced"] as const),
  ];
  return Decoration.set(changes
    .filter(([line]) => line >= 1 && line <= doc.lines)
    .map(([line, className]) =>
      Decoration.line({ attributes: { class: className } }).range(doc.line(line).from),
    ).sort((first, second) => first.from - second.from));
}
const diffDecorationsField = StateField.define({
  create: () => Decoration.none,
  update: (decorations, transaction) => {
    let next = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setDiffDecorations))
        next = diffDecorations(transaction.newDoc, effect.value);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function Editor({
  ref,
  content,
  readOnly = false,
  label,
  findings,
  reviewComments,
  lineDiff,
  diffSide,
  onChange,
  onScroll,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const initialContent = useRef(content);
  const onEdit = useEffectEvent((value: string) => onChange?.(value));
  const onViewport = useEffectEvent((line: number) => onScroll(line));

  useImperativeHandle(
    ref,
    () => ({
      jump(line, focus = false) {
        const view = editor.current;
        if (!view) return;
        const position = view.state.doc.line(
          Math.max(1, Math.min(line, view.state.doc.lines)),
        ).from;
        view.dispatch({
          ...(focus ? { selection: { anchor: position } } : {}),
          effects: EditorView.scrollIntoView(position, {
            y: focus ? "center" : "start",
          }),
        });
        if (focus) view.focus();
      },
      lineCount: () => editor.current?.state.doc.lines ?? 1,
    }),
    [],
  );

  useEffect(() => {
    if (!container.current) return;
    const view = new EditorView({
      parent: container.current,
      state: EditorState.create({
        doc: initialContent.current,
        extensions: [
          lineNumbers(),
          lintGutter(),
          history(),
          drawSelection(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          syntaxHighlighting(defaultHighlightStyle),
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.lineWrapping,
          reviewCommentsField,
          diffDecorationsField,
          EditorView.contentAttributes.of({
            "aria-label": label,
            spellcheck: "false",
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !readOnly)
              onEdit(update.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            scroll: (_event, current) => {
              const block = current.lineBlockAtHeight(
                Math.max(0, current.scrollDOM.scrollTop),
              );
              onViewport(current.state.doc.lineAt(block.from).number);
            },
          }),
          EditorView.theme({
            "&": { height: "100%", fontSize: "12px", backgroundColor: "#fff" },
            ".cm-scroller": {
              overflow: "auto",
              fontFamily: '"JetBrains Mono Variable", monospace',
              lineHeight: "1.85",
            },
            ".cm-content": { padding: "18px 0 80px", caretColor: "#087f75" },
            ".cm-line": { padding: "0 18px 0 8px" },
            ".cm-gutters": {
              background: "#fafbf9",
              color: "#909990",
              borderRight: "1px solid #edf0ec",
            },
            ".cm-gutterElement": { paddingLeft: "10px" },
            ".cm-activeLine": { background: "#f4f8f6" },
            ".cm-activeLineGutter": { background: "#e9f0eb" },
            "&.cm-focused": { outline: "none" },
            "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
              background: "#cae9df",
            },
          }),
        ],
      }),
    });
    editor.current = view;
    return () => {
      view.destroy();
      editor.current = null;
    };
  }, [label, readOnly]);

  useEffect(() => {
    const view = editor.current;
    if (!view) return;
    view.dispatch({
      effects: setReviewComments.of(reviewComments),
    });
  }, [reviewComments]);

  useEffect(() => {
    const view = editor.current;
    if (!view) return;
    if (content !== view.state.doc.toString()) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
      });
    }
    view.dispatch({
      effects: setDiffDecorations.of({
        diff: lineDiff ?? { added: [], removed: [], replaced: [] },
        side: diffSide ?? "left",
      }),
    });
  }, [content, lineDiff, diffSide]);

  useEffect(() => {
    const view = editor.current;
    if (!view) return;
    view.dispatch(
      setDiagnostics(
        view.state,
        findings.map((finding) => {
          const line = view.state.doc.line(
            Math.min(finding.line, view.state.doc.lines),
          );
          const last = view.state.doc.line(
            Math.min(finding.endLine ?? finding.line, view.state.doc.lines),
          );
          return {
            from: line.from,
            to: last.to,
            severity: finding.severity,
            message: `${finding.title}: ${finding.detail}`,
            source: "Review",
          };
        }),
      ),
    );
  }, [findings]);

  return <div ref={container} className="editor-host" />;
}
