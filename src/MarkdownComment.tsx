import { createElement, Fragment, useMemo } from "react";
import type { ReactNode } from "react";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { unified } from "unified";

type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  title?: string | null;
  depth?: number;
  ordered?: boolean | null;
  start?: number | null;
  checked?: boolean | null;
  alt?: string | null;
  lang?: string | null;
  children?: MarkdownNode[];
};

const parser = unified().use(remarkParse).use(remarkGfm);

function renderNode(node: MarkdownNode, key: number): ReactNode {
  const children = node.children?.map((child, index) =>
    renderNode(child, index),
  );
  switch (node.type) {
    case "root":
      return <Fragment key={key}>{children}</Fragment>;
    case "text":
    case "inlineCode":
    case "code":
      return node.type === "text"
        ? node.value
        : createElement(
            node.type === "code" ? "pre" : "code",
            { key, className: node.lang ? `language-${node.lang}` : undefined },
            node.value,
          );
    case "paragraph":
      return <p key={key}>{children}</p>;
    case "heading":
      return createElement(`h${node.depth ?? 2}`, { key }, children);
    case "strong":
    case "emphasis":
    case "delete":
      return createElement(
        node.type === "delete"
          ? "del"
          : node.type === "strong"
            ? "strong"
            : "em",
        { key },
        children,
      );
    case "blockquote":
      return <blockquote key={key}>{children}</blockquote>;
    case "list":
      return node.ordered ? (
        <ol key={key} start={node.start ?? undefined}>
          {children}
        </ol>
      ) : (
        <ul key={key}>{children}</ul>
      );
    case "listItem":
      return (
        <li key={key}>
          {node.checked === null || node.checked === undefined ? (
            children
          ) : (
            <>
              {node.checked ? "☑ " : "☐ "}
              {children}
            </>
          )}
        </li>
      );
    case "link": {
      let url: URL;
      try {
        url = new URL(node.url ?? "");
      } catch {
        return <span key={key}>{children}</span>;
      }
      if (!["https:", "http:", "mailto:"].includes(url.protocol))
        return <span key={key}>{children}</span>;
      return (
        <a
          key={key}
          href={url.href}
          title={node.title ?? undefined}
          target="_blank"
          rel="noreferrer"
        >
          {children}
        </a>
      );
    }
    case "image":
      return <span key={key}>{node.alt ?? ""}</span>;
    case "thematicBreak":
      return <hr key={key} />;
    case "table":
      return (
        <table key={key}>
          <tbody>{children}</tbody>
        </table>
      );
    case "tableHeader":
      return <tr key={key}>{children}</tr>;
    case "tableRow":
      return <tr key={key}>{children}</tr>;
    case "tableCell":
      return <td key={key}>{children}</td>;
    default:
      return children ? <Fragment key={key}>{children}</Fragment> : null;
  }
}

export function MarkdownComment({ markdown }: { markdown: string }) {
  const tree = useMemo(
    () => parser.parse(markdown) as unknown as MarkdownNode,
    [markdown],
  );
  return <div className="pr-comment-markdown">{renderNode(tree, 0)}</div>;
}
