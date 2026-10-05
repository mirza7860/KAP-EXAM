import katex from "katex";
import { Fragment, useMemo } from "react";

/**
 * Question text is authored by teachers, so it may carry LaTeX — `$r^2$`,
 * `$$\int_0^1 x\,dx$$`, `\( \)`, `\[ \]`. This renders those segments with
 * KaTeX and leaves everything else alone.
 *
 * It parses rather than mutating the DOM (what KaTeX's `auto-render` does):
 * the output is deterministic, so it survives hydration and works offline in
 * the student PWA. A malformed expression degrades to KaTeX's inline error
 * instead of throwing — a typo in a question must never blank the page.
 */
type Part =
  | { kind: "text"; value: string }
  | { kind: "math"; tex: string; display: boolean };

export function parseMath(source: string): Part[] {
  const parts: Part[] = [];
  let i = 0;
  let textStart = 0;

  const flush = (end: number) => {
    if (end > textStart) parts.push({ kind: "text", value: source.slice(textStart, end) });
  };

  while (i < source.length) {
    // $$ display … $$
    if (source[i] === "$" && source[i + 1] === "$") {
      const end = source.indexOf("$$", i + 2);
      if (end === -1) break;
      flush(i);
      parts.push({ kind: "math", tex: source.slice(i + 2, end), display: true });
      i = end + 2;
      textStart = i;
      continue;
    }

    // \( inline … \)   /   \[ display … \]
    if (source[i] === "\\" && (source[i + 1] === "(" || source[i + 1] === "[")) {
      const display = source[i + 1] === "[";
      const close = display ? "\\]" : "\\)";
      const end = source.indexOf(close, i + 2);
      if (end === -1) break;
      flush(i);
      parts.push({ kind: "math", tex: source.slice(i + 2, end), display });
      i = end + close.length;
      textStart = i;
      continue;
    }

    // $ inline … $ — must close on the same line, so a stray price never eats the rest
    if (source[i] === "$") {
      let j = i + 1;
      while (j < source.length && source[j] !== "$" && source[j] !== "\n") j++;
      if (j < source.length && source[j] === "$" && j > i + 1) {
        flush(i);
        parts.push({ kind: "math", tex: source.slice(i + 1, j), display: false });
        i = j + 1;
        textStart = i;
        continue;
      }
      i++;
      continue;
    }

    i++;
  }

  flush(source.length);
  return parts;
}

export function MathText({ children }: { children: string }) {
  const parts = useMemo(() => parseMath(children), [children]);

  // The overwhelmingly common case: no maths at all, so render the string.
  if (parts.length <= 1 && parts[0]?.kind === "text") return <>{children}</>;

  return (
    <>
      {parts.map((part, index) =>
        part.kind === "text" ? (
          <Fragment key={index}>{part.value}</Fragment>
        ) : (
          <span
            key={index}
            className={part.display ? "my-1 block overflow-x-auto" : "inline-block"}
            // KaTeX builds this markup itself; `throwOnError: false` keeps a bad
            // expression as red text rather than an exception.
            dangerouslySetInnerHTML={{
              __html: katex.renderToString(part.tex, {
                displayMode: part.display,
                throwOnError: false,
                strict: false,
              }),
            }}
          />
        ),
      )}
    </>
  );
}
