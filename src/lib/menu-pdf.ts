// Pure menu-PDF checks for the food form. No runtime "@/..." imports:
// scripts/unit/ loads this file directly with Node's type stripping.

/** 10 MiB — matches the `restaurant-menus` bucket's file_size_limit (C5). */
export const MAX_MENU_PDF_BYTES = 10 * 1024 * 1024;

export type MenuPdfProblem =
  "empty" | "tooLarge" | "notPdf" | "incomplete" | "unreadable";

export type MenuPdfRead =
  { ok: true; bytes: ArrayBuffer } | { ok: false; problem: MenuPdfProblem };

// Readers tolerate a short preamble before "%PDF-" (Acrobat: 1024 bytes) and
// look for "startxref" in the last 4096 bytes first (PDFium).
const HEADER_WINDOW = 1024;
const TRAILER_WINDOW = 4096;

const latin1 = new TextDecoder("latin1");

const hasTrailer = (text: string) =>
  text.includes("%%EOF") || text.includes("startxref");

/**
 * Judges a menu by its bytes, never by its name or the browser's `file.type`
 * (which comes from the extension: an empty or half-downloaded "menu.pdf"
 * looks like a PDF). A screen for the usual causes of Chrome's "Failed to load
 * PDF document" (nothing at all, not a PDF, a cut-short copy), not a parser.
 */
export function checkMenuPdfBytes(bytes: Uint8Array): MenuPdfProblem | null {
  if (bytes.length === 0) return "empty";
  if (bytes.length > MAX_MENU_PDF_BYTES) return "tooLarge";

  const head = latin1.decode(bytes.subarray(0, HEADER_WINDOW));
  if (!head.includes("%PDF-")) return "notPdf";

  // A download cut short keeps its header but loses the trailer.
  const tail = latin1.decode(
    bytes.subarray(Math.max(0, bytes.length - TRAILER_WINDOW)),
  );
  if (hasTrailer(tail)) return null;
  // PDFium still opens a complete file with a long run of data after its
  // trailer (it rebuilds the cross-reference table by scanning), so look
  // through the whole file before calling it cut short. A linearized file is
  // the exception: its first-page trailer sits near the start and would vouch
  // for a truncated copy.
  if (!head.includes("/Linearized") && hasTrailer(latin1.decode(bytes))) {
    return null;
  }
  return "incomplete";
}

/**
 * Reads the picked file once and checks what was read. Callers upload the
 * returned `bytes`, not the live `File` handle, so what is checked is exactly
 * what is stored (a file that changes on disk after the pick can't slip by).
 */
export async function readMenuPdf(file: Blob): Promise<MenuPdfRead> {
  // Refuse before reading: an oversize file is never pulled into memory.
  if (file.size > MAX_MENU_PDF_BYTES) {
    return { ok: false, problem: "tooLarge" };
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    // Moved/locked/cloud-only file: the browser can no longer read it.
    return { ok: false, problem: "unreadable" };
  }

  const problem = checkMenuPdfBytes(new Uint8Array(bytes));
  return problem ? { ok: false, problem } : { ok: true, bytes };
}
