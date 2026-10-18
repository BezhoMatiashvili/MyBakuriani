// Pure ownership-verification checks shared by the owner page, the API routes
// and the admin panel (C39). No runtime "@/..." imports: scripts/unit/ loads
// this file directly with Node's type stripping.

/** 10 MiB — matches the `ownership-documents` bucket's file_size_limit. */
export const MAX_OWNERSHIP_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Unpurged files one owner may hold (the documents table's insert trigger). */
export const MAX_OWNERSHIP_DOCUMENTS_PER_OWNER = 60;

/** Listings one submission may cover (submit_ownership_verifications). */
export const MAX_OWNERSHIP_ITEMS = 50;

/** Longest admin reason (the decision_note CHECK). */
export const MAX_OWNERSHIP_DECISION_NOTE = 500;

/** Must equal the ownership_verification_documents.kind CHECK. */
export const OWNERSHIP_DOCUMENT_KINDS = [
  "identity",
  "registry_extract",
] as const;
export type OwnershipDocumentKind = (typeof OWNERSHIP_DOCUMENT_KINDS)[number];

/** Must equal the ownership_verifications.status CHECK. */
export const OWNERSHIP_VERIFICATION_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "revoked",
] as const;
export type OwnershipVerificationStatus =
  (typeof OWNERSHIP_VERIFICATION_STATUSES)[number];

export type OwnershipListingKind = "property" | "service";

export type OwnershipDocumentType = "pdf" | "jpeg" | "png" | "webp";

/** The content type a stored document is served with. Never the client's claim. */
export const OWNERSHIP_DOCUMENT_CONTENT_TYPES: Record<
  OwnershipDocumentType,
  string
> = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export const OWNERSHIP_DOCUMENT_EXTENSIONS: Record<
  OwnershipDocumentType,
  string
> = {
  pdf: "pdf",
  jpeg: "jpg",
  png: "png",
  webp: "webp",
};

export type OwnershipDocumentProblem =
  "empty" | "tooLarge" | "unsupported" | "incomplete";

export type OwnershipDocumentCheck =
  | { ok: true; type: OwnershipDocumentType; contentType: string }
  | { ok: false; problem: OwnershipDocumentProblem };

export function isOwnershipDocumentKind(
  value: unknown,
): value is OwnershipDocumentKind {
  return (
    typeof value === "string" &&
    (OWNERSHIP_DOCUMENT_KINDS as readonly string[]).includes(value)
  );
}

export function isOwnershipVerificationStatus(
  value: unknown,
): value is OwnershipVerificationStatus {
  return (
    typeof value === "string" &&
    (OWNERSHIP_VERIFICATION_STATUSES as readonly string[]).includes(value)
  );
}

// Readers tolerate a short preamble before "%PDF-" (Acrobat: 1024 bytes) and
// look for the trailer in the last 4096 bytes first (PDFium) — the same
// windows as src/lib/menu-pdf.ts.
const PDF_HEADER_WINDOW = 1024;
const PDF_TRAILER_WINDOW = 4096;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const latin1 = new TextDecoder("latin1");

const hasPdfTrailer = (text: string) =>
  text.includes("%%EOF") || text.includes("startxref");

function startsWith(bytes: Uint8Array, prefix: readonly number[], at = 0) {
  if (bytes.length < at + prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (bytes[at + i] !== prefix[i]) return false;
  }
  return true;
}

function ascii(text: string): number[] {
  return Array.from(text, (c) => c.charCodeAt(0));
}

/**
 * Identifies an ID card, passport or registry extract by its bytes, never by
 * its name or the browser's declared type. PDF needs its header in the first
 * 1024 bytes and a trailer (a copy cut short keeps its header but loses the
 * trailer); JPEG, PNG and WebP need their signatures. A screen, not a parser:
 * the admin still looks at every file.
 */
export function checkOwnershipDocumentBytes(
  bytes: Uint8Array,
): OwnershipDocumentCheck {
  if (bytes.length === 0) return { ok: false, problem: "empty" };
  if (bytes.length > MAX_OWNERSHIP_DOCUMENT_BYTES) {
    return { ok: false, problem: "tooLarge" };
  }

  const head = latin1.decode(bytes.subarray(0, PDF_HEADER_WINDOW));
  if (head.includes("%PDF-")) {
    const tail = latin1.decode(
      bytes.subarray(Math.max(0, bytes.length - PDF_TRAILER_WINDOW)),
    );
    // A complete file may carry data after its trailer; a linearized one has
    // a first-page trailer near the start that would vouch for a cut copy.
    const complete =
      hasPdfTrailer(tail) ||
      (!head.includes("/Linearized") && hasPdfTrailer(latin1.decode(bytes)));
    return complete
      ? {
          ok: true,
          type: "pdf",
          contentType: OWNERSHIP_DOCUMENT_CONTENT_TYPES.pdf,
        }
      : { ok: false, problem: "incomplete" };
  }

  if (startsWith(bytes, [0xff, 0xd8, 0xff]) && bytes.length >= 4) {
    return {
      ok: true,
      type: "jpeg",
      contentType: OWNERSHIP_DOCUMENT_CONTENT_TYPES.jpeg,
    };
  }
  if (startsWith(bytes, PNG_SIGNATURE)) {
    return {
      ok: true,
      type: "png",
      contentType: OWNERSHIP_DOCUMENT_CONTENT_TYPES.png,
    };
  }
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) {
    return {
      ok: true,
      type: "webp",
      contentType: OWNERSHIP_DOCUMENT_CONTENT_TYPES.webp,
    };
  }
  return { ok: false, problem: "unsupported" };
}

/** File-picker `accept`: what the page offers (HEIC is converted before upload). */
export const OWNERSHIP_FILE_ACCEPT =
  ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";

const ACCEPTED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const ACCEPTED_EXTENSIONS = new Set([
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic",
  "heif",
]);

/**
 * The page's pre-check before any upload. Accepts by MIME type OR extension,
 * because Android pickers often report an empty type. The server's byte check
 * stays the authority.
 */
export function isAcceptableOwnershipFile(name: string, type: string): boolean {
  if (ACCEPTED_TYPES.has(type.toLowerCase())) return true;
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  return ACCEPTED_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/** `?listing=<kind>:<id>` on the owner page. */
export function parseOwnershipListingParam(
  value: string | null | undefined,
): { kind: OwnershipListingKind; id: string } | null {
  if (!value) return null;
  const match = /^(property|service):([0-9a-f-]{36})$/i.exec(value.trim());
  if (!match) return null;
  return { kind: match[1].toLowerCase() as OwnershipListingKind, id: match[2] };
}
