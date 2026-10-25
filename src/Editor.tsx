import { useEffect, useEffectEvent, useImperativeHandle, useRef } from "react";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
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
  onChange?: (content: string) => void;
  onScroll: (line: number) => void;
};

export function Editor({
  ref,
  content,
  readOnly = false,
  label,
  findings,
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
    if (view && content !== view.state.doc.toString())
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
      });
  }, [content]);

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
