/** Convert Google Docs / rich HTML clipboard content to markdown for storage. */
export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return blocksToMarkdown(doc.body).trim();
}

function blocksToMarkdown(node: Node): string {
  const parts: string[] = [];
  for (const child of node.childNodes) {
    parts.push(inlineToMarkdown(child));
  }
  return parts.join("\n\n").replace(/\n{3,}/g, "\n\n");
}

function inlineToMarkdown(node: Node, listDepth = 0): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? "").replace(/\s+/g, " ");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const inner = () => Array.from(el.childNodes).map((c) => inlineToMarkdown(c, listDepth)).join("");

  switch (tag) {
    case "h1":
      return `# ${inner().trim()}`;
    case "h2":
      return `## ${inner().trim()}`;
    case "h3":
      return `### ${inner().trim()}`;
    case "h4":
      return `#### ${inner().trim()}`;
    case "p":
    case "div":
      return inner().trim();
    case "br":
      return "\n";
    case "strong":
    case "b":
      return `**${inner().trim()}**`;
    case "em":
    case "i":
      return `*${inner().trim()}*`;
    case "u":
      return inner().trim();
    case "a": {
      const href = el.getAttribute("href") ?? "";
      const text = inner().trim() || href;
      return href ? `[${text}](${href})` : text;
    }
    case "ul":
      return Array.from(el.children)
        .map((li) => `- ${inlineToMarkdown(li, listDepth + 1).trim()}`)
        .join("\n");
    case "ol":
      return Array.from(el.children)
        .map((li, i) => `${i + 1}. ${inlineToMarkdown(li, listDepth + 1).trim()}`)
        .join("\n");
    case "li":
      return inner().trim();
    case "blockquote":
      return inner()
        .trim()
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
    case "code":
      return `\`${inner().trim()}\``;
    case "pre":
      return "```\n" + (el.textContent ?? "").trim() + "\n```";
    case "span":
    default:
      return inner();
  }
}

/** Prefer markdown/HTML from clipboard; fall back to plain text. */
export function pasteToMarkdown(clipboard: DataTransfer): string {
  const html = clipboard.getData("text/html");
  if (html && html.trim()) {
    try {
      const md = htmlToMarkdown(html);
      if (md.trim()) return md;
    } catch {
      // fall through
    }
  }
  return clipboard.getData("text/plain");
}
