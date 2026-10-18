// Pure CV file checks shared by the application form and its API route. No
// runtime "@/..." imports: scripts/unit/ loads this file directly with Node's
// type stripping.

/** 10 MiB — matches the `cv-documents` bucket's file_size_limit. */
export const MAX_CV_BYTES = 10 * 1024 * 1024;

export type CvType = "pdf" | "docx";

/** The content type a stored CV is served with. Never the client's claim. */
export const CV_CONTENT_TYPES: Record<CvType, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04"
const DOCX_PART = Array.from("word/document.xml", (c) => c.charCodeAt(0));

function indexOf(
  haystack: Uint8Array,
  needle: readonly number[],
  from: number,
  to: number,
): number {
  const last = Math.min(to, haystack.length) - needle.length;
  outer: for (let i = from; i <= last; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/**
 * Identifies a CV by its bytes, not its name or declared type.
 * PDF: "%PDF-" within the first 1024 bytes (readers accept a short preamble).
 * DOCX: a ZIP archive (local-file header first) that contains the
 * "word/document.xml" part name.
 */
export function sniffCvType(bytes: Uint8Array): CvType | null {
  if (indexOf(bytes, PDF_MAGIC, 0, 1024) !== -1) return "pdf";
  if (
    indexOf(bytes, ZIP_MAGIC, 0, ZIP_MAGIC.length) === 0 &&
    indexOf(bytes, DOCX_PART, 0, bytes.length) !== -1
  ) {
    return "docx";
  }
  return null;
}
