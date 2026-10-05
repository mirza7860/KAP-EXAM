import { useRef } from "react";
import { Button } from "./button";
import { cn } from "../lib/cn";
import { MathText } from "./math-text";
import { Textarea } from "./textarea";

/**
 * A LaTeX field that stays honest while you type: plain text in, KaTeX out,
 * side by side.
 *
 * No contenteditable and no maths-on-images — teachers author questions as
 * text with `$…$` / `$$…$$` markers, the toolbar drops the markers in at the
 * caret, and the preview under the box shows exactly what a student will see.
 */
interface Snippet {
  label: string;
  title: string;
  tex: string;
  /** Caret offset from the start of the inserted text. */
  caret?: number;
}

const SNIPPETS: Snippet[] = [
  { label: "a/b", title: "Fraction", tex: "\\frac{}{}", caret: 6 },
  { label: "√", title: "Square root", tex: "\\sqrt{}", caret: 6 },
  { label: "x²", title: "Superscript (power)", tex: "^{}", caret: 2 },
  { label: "xₙ", title: "Subscript (index)", tex: "_{}", caret: 2 },
  { label: "x̂", title: "Hat (unit vector)", tex: "\\hat{}", caret: 5 },
  { label: "( )", title: "Sized brackets", tex: "\\left( \\right)", caret: 7 },
  { label: "∑", title: "Sum", tex: "\\sum_{}^{}", caret: 6 },
  { label: "∫", title: "Integral", tex: "\\int_{}^{}", caret: 6 },
  { label: "≠", title: "Not equal", tex: "\\neq " },
  { label: "≤", title: "Less than or equal", tex: "\\le " },
  { label: "∞", title: "Infinity", tex: "\\infty " },
  { label: "π", title: "Pi", tex: "\\pi " },
];

export function LatexEditor({
  value,
  onChange,
  placeholder,
  rows = 3,
  className,
  ariaLabel,
  id,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  ariaLabel?: string;
  /** So a surrounding `<Label htmlFor>` can still reach the field. */
  id?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const insert = (tex: string, caret?: number) => {
    const el = ref.current;
    if (!el) {
      onChange(value + tex);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const caretAt = start + (caret ?? tex.length);
    onChange(value.slice(0, start) + tex + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caretAt, caretAt);
    });
  };

  /** Wrap whatever is selected in `$…$` (or drop an empty pair in place). */
  const wrapInMath = () => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selection = value.slice(start, end) || "x";
    const text = `$${selection}$`;
    onChange(value.slice(0, start) + text + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const after = start + text.length;
      el.setSelectionRange(after, after);
    });
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-1">
        {SNIPPETS.map((s) => (
          <Button
            key={s.label}
            type="button"
            variant="outline"
            size="sm"
            title={s.title}
            className="h-7 px-2 text-xs"
            onClick={() => insert(s.tex, s.caret)}
          >
            {s.label}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title="Wrap the selection in $ … $"
          className="h-7 px-2 text-xs"
          onClick={wrapInMath}
        >
          $ … $
        </Button>
      </div>

      <Textarea
        ref={ref}
        id={id}
        value={value}
        rows={rows}
        aria-label={ariaLabel}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />

      {value.trim() !== "" && (
        <div className="rounded-md border border-dashed border-border/80 bg-muted/40 px-3 py-2">
          <p className="eyebrow mb-1">Preview</p>
          <p className="text-sm leading-relaxed">
            <MathText>{value}</MathText>
          </p>
        </div>
      )}
    </div>
  );
}
