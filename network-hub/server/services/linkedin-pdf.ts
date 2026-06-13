import { extractText, getDocumentProxy } from "unpdf";
import { parseLinkedInPdfText } from "./linkedin-pdf-parse";

export async function parseLinkedInResumePdf(buffer: ArrayBuffer, linkedinUrl?: string) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  const fullText = Array.isArray(text) ? text.join("\n") : String(text);
  if (!fullText.trim()) throw new Error("Could not extract text from PDF — try a LinkedIn 'Save to PDF' export");
  return parseLinkedInPdfText(fullText, linkedinUrl);
}
