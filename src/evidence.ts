import type { EvidenceDocument } from "./types.js";

const MAX_EXTRACTED_CHARS = 4_000;

const SUPPORTED_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "application/json",
  "text/csv",
  "text/html",
]);

export type EvidenceExtractionResult = {
  document_id: string;
  status: "extracted" | "unsupported" | "unavailable" | "failed";
  mime_type?: string;
  text?: string;
  reason?: string;
};

function normalizeMimeType(mimeType: string | undefined): string | undefined {
  return mimeType?.split(";")[0]?.trim().toLowerCase();
}

function boundText(text: string): string {
  return text.trim().replace(/\s+/g, " ").slice(0, MAX_EXTRACTED_CHARS);
}

function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function extractText(body: string, mimeType: string): string {
  if (mimeType === "application/json") {
    try {
      return boundText(JSON.stringify(JSON.parse(body), null, 2));
    } catch {
      return boundText(body);
    }
  }

  if (mimeType === "text/html") {
    return boundText(htmlToText(body));
  }

  return boundText(body);
}

export async function extractEvidenceDocuments(
  documents: EvidenceDocument[],
): Promise<EvidenceExtractionResult[]> {
  const results: EvidenceExtractionResult[] = [];

  for (const document of documents) {
    const mimeType = normalizeMimeType(document.mime_type);

    if (document.status === "removed" || document.signed_url == null) {
      results.push({
        document_id: document.document_id,
        status: "unavailable",
        mime_type: mimeType,
        reason: "document is not downloadable",
      });
      continue;
    }

    if (!mimeType || !SUPPORTED_MIME_TYPES.has(mimeType)) {
      console.warn(
        `WARN Evidence document ${document.document_id} has unsupported type ${mimeType ?? "unknown"}`,
      );
      results.push({
        document_id: document.document_id,
        status: "unsupported",
        mime_type: mimeType,
        reason: "unsupported document type",
      });
      continue;
    }

    try {
      const response = await fetch(document.signed_url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      results.push({
        document_id: document.document_id,
        status: "extracted",
        mime_type: mimeType,
        text: extractText(await response.text(), mimeType),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `WARN Evidence document ${document.document_id} retrieval failed: ${message}`,
      );
      results.push({
        document_id: document.document_id,
        status: "failed",
        mime_type: mimeType,
        reason: message,
      });
    }
  }

  return results;
}
