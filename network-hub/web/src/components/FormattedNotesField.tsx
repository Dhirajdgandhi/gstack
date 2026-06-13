import { ClipboardEvent, useState } from "react";
import { pasteToMarkdown } from "../lib/html-to-markdown";
import MarkdownContent from "./MarkdownContent";

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  hint?: string;
}

/** Textarea that preserves Google Docs formatting as markdown on paste, with live preview. */
export default function FormattedNotesField({
  id,
  label,
  value,
  onChange,
  placeholder,
  rows = 5,
  hint,
}: Props) {
  const [preview, setPreview] = useState(false);

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const md = pasteToMarkdown(e.clipboardData);
    if (!md) return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + md + value.slice(end);
    onChange(next);
  }

  return (
    <div className="field formatted-notes">
      <div className="review-header">
        <label htmlFor={id}>{label}</label>
        <button type="button" className="btn secondary" style={{ padding: "0.25rem 0.6rem", fontSize: "0.85rem" }} onClick={() => setPreview((p) => !p)}>
          {preview ? "Edit" : "Preview"}
        </button>
      </div>
      {hint && <p className="hint" style={{ marginTop: 0 }}>{hint}</p>}
      {preview ? (
        value.trim() ? (
          <MarkdownContent content={value} />
        ) : (
          <p className="empty" style={{ margin: 0 }}>Nothing to preview yet.</p>
        )
      ) : (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={handlePaste}
          placeholder={placeholder}
          rows={rows}
        />
      )}
    </div>
  );
}
