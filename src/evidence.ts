import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { PDFParse } from "pdf-parse";

import { getOpenAIModelName } from "./openai-model.js";
import type { EvidenceDocument } from "./types.js";

const MAX_EXTRACTED_CHARS = 4_000;
const IMAGE_EXTRACTION_MODEL = openai(
  getOpenAIModelName("OPENAI_MODEL_EVIDENCE"),
);
const PDF_MIME_TYPE = "application/pdf";
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const IMAGE_EXTRACTION_PROMPT = [
  "Extract concise evidence from this image for campaign credibility scoring.",
  "Extract visible text if present.",
  "Describe salient visible document or scene content relevant to credibility.",
  "Be conservative and avoid speculation.",
  "Say when text is illegible or content is unclear.",
  "Do not infer facts that are not visually supported.",
  "Do not roleplay, narrate emotionally, or write a poetic caption.",
  "Return plain text only, suitable for downstream scoring.",
].join(" ");

const SUPPORTED_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "application/json",
  "text/csv",
  "text/html",
  PDF_MIME_TYPE,
  ...IMAGE_MIME_TYPES,
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

async function extractPdfText(body: ArrayBuffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(body) });

  try {
    const result = await parser.getText();

    return boundText(result.text);
  } finally {
    await parser.destroy();
  }
}

async function extractImageText(
  body: ArrayBuffer,
  mimeType: string,
): Promise<string> {
  const response = await generateText({
    model: IMAGE_EXTRACTION_MODEL,
    temperature: 0,
    maxOutputTokens: 300,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: IMAGE_EXTRACTION_PROMPT },
          {
            type: "image",
            image: new Uint8Array(body),
            mediaType: mimeType,
          },
        ],
      },
    ],
  });

  return boundText(response.text);
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

      const text =
        mimeType === PDF_MIME_TYPE
          ? await extractPdfText(await response.arrayBuffer())
          : IMAGE_MIME_TYPES.has(mimeType)
            ? await extractImageText(await response.arrayBuffer(), mimeType)
          : extractText(await response.text(), mimeType);

      results.push({
        document_id: document.document_id,
        status: "extracted",
        mime_type: mimeType,
        text,
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
