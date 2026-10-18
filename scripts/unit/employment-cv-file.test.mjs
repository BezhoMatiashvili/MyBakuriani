import { test } from "node:test";
import assert from "node:assert/strict";
import { CV_CONTENT_TYPES, MAX_CV_BYTES, sniffCvType } from "../../src/lib/employment/cv-file.ts";

const bytes = (text) => new TextEncoder().encode(text);

const MINIMAL_PDF = bytes(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

// A ZIP local-file header followed by the part name, as a .docx starts
// ("[Content_Types].xml" first, "word/document.xml" later in the archive).
function docxStub(partName = "word/document.xml") {
  const header = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
  const rest = bytes(`....[Content_Types].xml....${partName}....PK\x01\x02`);
  const out = new Uint8Array(header.length + rest.length);
  out.set(header, 0);
  out.set(rest, header.length);
  return out;
}

test("the cap is 10 MiB and content types are fixed per kind", () => {
  assert.equal(MAX_CV_BYTES, 10485760);
  assert.equal(CV_CONTENT_TYPES.pdf, "application/pdf");
  assert.equal(
    CV_CONTENT_TYPES.docx,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
});

test("a real minimal PDF is a pdf, also with a short preamble", () => {
  assert.equal(sniffCvType(MINIMAL_PDF), "pdf");
  const preamble = new Uint8Array(512 + MINIMAL_PDF.length);
  preamble.set(MINIMAL_PDF, 512);
  assert.equal(sniffCvType(preamble), "pdf");
});

test("%PDF- past the first 1024 bytes is not a pdf", () => {
  const late = new Uint8Array(2048 + MINIMAL_PDF.length);
  late.set(MINIMAL_PDF, 2048);
  assert.equal(sniffCvType(late), null);
});

test("a zip with word/document.xml is a docx; other zips are not", () => {
  assert.equal(sniffCvType(docxStub()), "docx");
  assert.equal(sniffCvType(docxStub("xl/workbook.xml")), null);
});

test("word/document.xml without a leading ZIP header is not a docx", () => {
  assert.equal(sniffCvType(bytes("hello word/document.xml")), null);
});

test("a text file renamed to .pdf is rejected", () => {
  assert.equal(sniffCvType(bytes("Name: Test\nExperience: 5 years\n")), null);
  assert.equal(sniffCvType(new Uint8Array()), null);
});
