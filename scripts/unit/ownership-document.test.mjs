import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_OWNERSHIP_DECISION_NOTE,
  MAX_OWNERSHIP_DOCUMENT_BYTES,
  MAX_OWNERSHIP_DOCUMENTS_PER_OWNER,
  MAX_OWNERSHIP_ITEMS,
  OWNERSHIP_DOCUMENT_CONTENT_TYPES,
  OWNERSHIP_DOCUMENT_KINDS,
  OWNERSHIP_VERIFICATION_STATUSES,
  checkOwnershipDocumentBytes,
  isAcceptableOwnershipFile,
  isOwnershipDocumentKind,
  isOwnershipVerificationStatus,
  parseOwnershipListingParam,
} from "../../src/lib/ownership/document-file.ts";

const bytes = (text) => new TextEncoder().encode(text);
const fromRoot = (path) => new URL(`../../${path}`, import.meta.url);
const MIGRATION = readFileSync(
  fromRoot("supabase/migrations/20261001200000_ownership_verification.sql"),
  "utf8",
);

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const MINIMAL_PDF = bytes(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\nstartxref\n9\n%%EOF\n",
);
// A real-world PDF and JPEG from the repo (the e2e fixtures use the same two).
const SAMPLE_PDF = new Uint8Array(
  readFileSync(fromRoot("supabase/seed/sample-menu.pdf")),
);
const SAMPLE_JPEG = new Uint8Array(
  readFileSync(fromRoot("public/placeholder-property.jpg")),
);
const PNG = concat(
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  bytes("....IHDR...."),
);
const WEBP = concat(
  bytes("RIFF"),
  new Uint8Array([0x24, 0, 0, 0]),
  bytes("WEBPVP8 ...."),
);

/** The values of a CHECK (col IN ('a', 'b')) in the migration, in order. */
function checkValues(constraintName) {
  const block = MIGRATION.split(`CONSTRAINT ${constraintName}`)[1];
  assert.ok(block, `constraint ${constraintName} not found in the migration`);
  const list = block.match(/IN \(([^)]*)\)/)?.[1] ?? "";
  return [...list.matchAll(/'([a-z_/.+-]+)'/g)].map((m) => m[1]);
}

test("the size cap is 10 MiB and equals the ownership-documents bucket limit", () => {
  assert.equal(MAX_OWNERSHIP_DOCUMENT_BYTES, 10485760);
  const limit = MIGRATION.match(
    /'ownership-documents'\s*,\s*'ownership-documents'\s*,\s*false\s*,\s*(\d+)/,
  )?.[1];
  assert.equal(Number(limit), MAX_OWNERSHIP_DOCUMENT_BYTES);
  assert.match(MIGRATION, /CHECK \(byte_size BETWEEN 1 AND 10485760\)/);
});

test("kinds, statuses and content types equal the migration CHECK lists", () => {
  assert.deepEqual(checkValues("ownership_verification_documents_kind_check"), [
    ...OWNERSHIP_DOCUMENT_KINDS,
  ]);
  assert.deepEqual(checkValues("ownership_verifications_status_check"), [
    ...OWNERSHIP_VERIFICATION_STATUSES,
  ]);
  assert.deepEqual(
    checkValues("ownership_verification_documents_content_type_check").sort(),
    Object.values(OWNERSHIP_DOCUMENT_CONTENT_TYPES).sort(),
  );
});

test("the per-owner cap, batch size and note length equal the SQL", () => {
  assert.match(
    MIGRATION,
    new RegExp(
      `\\) >= ${MAX_OWNERSHIP_DOCUMENTS_PER_OWNER} THEN\\s+RAISE EXCEPTION 'OWNERSHIP_DOCUMENT_LIMIT'`,
    ),
  );
  assert.match(
    MIGRATION,
    new RegExp(`v_count < 1 OR v_count > ${MAX_OWNERSHIP_ITEMS} THEN`),
  );
  assert.match(
    MIGRATION,
    new RegExp(
      `char_length\\(decision_note\\) <= ${MAX_OWNERSHIP_DECISION_NOTE}`,
    ),
  );
});

test("each accepted type is recognised by its bytes", () => {
  assert.deepEqual(checkOwnershipDocumentBytes(MINIMAL_PDF), {
    ok: true,
    type: "pdf",
    contentType: "application/pdf",
  });
  assert.equal(checkOwnershipDocumentBytes(SAMPLE_PDF).type, "pdf");
  assert.equal(checkOwnershipDocumentBytes(SAMPLE_JPEG).type, "jpeg");
  assert.equal(checkOwnershipDocumentBytes(PNG).type, "png");
  assert.equal(checkOwnershipDocumentBytes(WEBP).type, "webp");
});

test("a PDF with a short preamble is accepted; a late header is not", () => {
  const preamble = concat(new Uint8Array(512), MINIMAL_PDF);
  assert.equal(checkOwnershipDocumentBytes(preamble).type, "pdf");
  const late = concat(new Uint8Array(2048), MINIMAL_PDF);
  assert.deepEqual(checkOwnershipDocumentBytes(late), {
    ok: false,
    problem: "unsupported",
  });
});

test("a PDF cut short (header kept, trailer lost) is incomplete", () => {
  const cut = SAMPLE_PDF.subarray(0, Math.floor(SAMPLE_PDF.length / 2));
  assert.deepEqual(checkOwnershipDocumentBytes(cut), {
    ok: false,
    problem: "incomplete",
  });
});

test("empty, oversize and renamed files are refused", () => {
  assert.deepEqual(checkOwnershipDocumentBytes(new Uint8Array()), {
    ok: false,
    problem: "empty",
  });
  assert.deepEqual(
    checkOwnershipDocumentBytes(
      new Uint8Array(MAX_OWNERSHIP_DOCUMENT_BYTES + 1),
    ),
    { ok: false, problem: "tooLarge" },
  );
  // A text file renamed to passport.jpg / extract.pdf.
  assert.deepEqual(
    checkOwnershipDocumentBytes(bytes("Name: Test\nID: 01001\n")),
    {
      ok: false,
      problem: "unsupported",
    },
  );
  // An HTML page is never served as a document.
  assert.equal(
    checkOwnershipDocumentBytes(
      bytes("<!doctype html><script>alert(1)</script>"),
    ).ok,
    false,
  );
  // Three bytes of a JPEG signature are not an image.
  assert.equal(
    checkOwnershipDocumentBytes(new Uint8Array([0xff, 0xd8, 0xff])).ok,
    false,
  );
});

test("the page pre-check accepts by type or extension (Android sends no type)", () => {
  assert.equal(isAcceptableOwnershipFile("scan.pdf", ""), true);
  assert.equal(isAcceptableOwnershipFile("IMG_0001.HEIC", ""), true);
  assert.equal(isAcceptableOwnershipFile("photo", "image/jpeg"), true);
  assert.equal(isAcceptableOwnershipFile("photo.webp", "image/webp"), true);
  assert.equal(isAcceptableOwnershipFile("notes.txt", "text/plain"), false);
  assert.equal(isAcceptableOwnershipFile("archive.zip", ""), false);
  assert.equal(isAcceptableOwnershipFile("noextension", ""), false);
});

test("kind and status guards", () => {
  assert.equal(isOwnershipDocumentKind("identity"), true);
  assert.equal(isOwnershipDocumentKind("registry_extract"), true);
  assert.equal(isOwnershipDocumentKind("passport"), false);
  assert.equal(isOwnershipDocumentKind(undefined), false);
  assert.equal(isOwnershipVerificationStatus("approved"), true);
  assert.equal(isOwnershipVerificationStatus("active"), false);
});

test("?listing=<kind>:<id> parses only well-formed values", () => {
  const id = "02f58755-95d7-48ca-806f-d1c110b1aa03";
  assert.deepEqual(parseOwnershipListingParam(`property:${id}`), {
    kind: "property",
    id,
  });
  assert.deepEqual(parseOwnershipListingParam(`SERVICE:${id}`), {
    kind: "service",
    id,
  });
  assert.equal(parseOwnershipListingParam(`listing:${id}`), null);
  assert.equal(parseOwnershipListingParam("property:1"), null);
  assert.equal(parseOwnershipListingParam(null), null);
  assert.equal(parseOwnershipListingParam(""), null);
});
