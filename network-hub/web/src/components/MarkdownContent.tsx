import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  content: string;
  className?: string;
}

/** Render stored markdown (from Google Docs paste or manual entry). */
export default function MarkdownContent({ content, className = "markdown-body" }: Props) {
  if (!content.trim()) return null;
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
