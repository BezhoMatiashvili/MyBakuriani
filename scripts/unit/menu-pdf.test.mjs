import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_MENU_PDF_BYTES,
  checkMenuPdfBytes,
  readMenuPdf,
} from "../../src/lib/menu-pdf.ts";

const bytes = (text) => new TextEncoder().encode(text);
const fromRoot = (path) => new URL(`../../${path}`, import.meta.url);

// Structurally complete (header, objects, trailer) but a zero-page document,
// so Chrome's viewer will not show it. These tests are about structure only.
const MINIMAL_PDF = bytes(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\nstartxref\n9\n%%EOF\n",
);

// A real-world menu PDF: the one the demo food venues link to.
const SAMPLE_MENU = new Uint8Array(
  readFileSync(fromRoot("supabase/seed/sample-menu.pdf")),
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

// A linearized file keeps a first-page trailer right after its header; `tail`
// is whatever closes the file (its main trailer, or nothing if it was cut).
function linearized(bodyLength, tail = "startxref\n9\n%%EOF") {
  return concat(
    bytes(
      "%PDF-1.4\n1 0 obj\n<</Linearized 1/L 99999/O 3/N 1/T 99>>\nendobj\ntrailer<</Root 2 0 R>>\nstartxref\n0\n%%EOF\n",
    ),
    new Uint8Array(bodyLength),
    bytes(tail),
  );
}

test("the cap is 10 MiB and equals the restaurant-menus bucket limit", () => {
  assert.equal(MAX_MENU_PDF_BYTES, 10485760);
  const sql = readFileSync(
    fromRoot("supabase/migrations/20260528120000_restaurant_menus_bucket.sql"),
    "utf8",
  );
  const limit = sql.match(
    /'restaurant-menus'\s*,\s*'restaurant-menus'\s*,\s*true\s*,\s*(\d+)/,
  )?.[1];
  assert.equal(Number(limit), MAX_MENU_PDF_BYTES);
});

test("an empty file is rejected, even though the browser calls it a pdf", async () => {
  // The 2026-10-01 staging incident: Chrome reports `type` from the extension,
  // so the old `file.type !== "application/pdf"` check passed this file and a
  // 0-byte object became services.menu_url.
  const file = new File([], "menu.pdf", { type: "application/pdf" });
  assert.equal(file.type, "application/pdf");
  assert.equal(file.size, 0);

  assert.equal(checkMenuPdfBytes(new Uint8Array()), "empty");
  assert.deepEqual(await readMenuPdf(file), { ok: false, problem: "empty" });
});

test("complete PDFs pass, also with a short preamble", () => {
  assert.equal(checkMenuPdfBytes(MINIMAL_PDF), null);
  assert.equal(checkMenuPdfBytes(SAMPLE_MENU), null);
  assert.equal(
    checkMenuPdfBytes(concat(new Uint8Array(512), SAMPLE_MENU)),
    null,
  );
});

test("%PDF- must sit entirely inside the first 1024 bytes", () => {
  const after = (n) => concat(new Uint8Array(n), MINIMAL_PDF);
  assert.equal(checkMenuPdfBytes(after(1019)), null);
  assert.equal(checkMenuPdfBytes(after(1020)), "notPdf");
  assert.equal(checkMenuPdfBytes(after(2048)), "notPdf");
});

test("text, images and office files renamed to .pdf are rejected", () => {
  const png = concat(
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    new Uint8Array(64),
  );
  const docx = concat(
    new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
    bytes("word/document.xml"),
  );
  assert.equal(
    checkMenuPdfBytes(bytes("Menu: soup 8, khachapuri 12\n")),
    "notPdf",
  );
  assert.equal(checkMenuPdfBytes(png), "notPdf");
  assert.equal(checkMenuPdfBytes(docx), "notPdf");
});

test("a PDF cut short (a download that never finished) is incomplete", () => {
  assert.equal(
    checkMenuPdfBytes(SAMPLE_MENU.subarray(0, SAMPLE_MENU.length >> 1)),
    "incomplete",
  );
  assert.equal(checkMenuPdfBytes(SAMPLE_MENU.subarray(0, 100)), "incomplete");
  assert.equal(checkMenuPdfBytes(bytes("%PDF-1.4\n")), "incomplete");
});

test("a complete PDF with a long run of data after its trailer passes, as in Chrome", () => {
  // PDFium rebuilds the cross-reference table by scanning, so it opens these;
  // a scanner or signing tool can leave kilobytes of padding behind %%EOF.
  const padded = (n) => concat(MINIMAL_PDF, new Uint8Array(n));
  for (const n of [3000, 4090, 4091, 5000, 300_000]) {
    assert.equal(checkMenuPdfBytes(padded(n)), null, `${n} trailing bytes`);
  }
  assert.equal(
    checkMenuPdfBytes(concat(SAMPLE_MENU, new Uint8Array(9000))),
    null,
  );
});

test("a cut-short PDF stays incomplete, whatever follows the cut", () => {
  const half = SAMPLE_MENU.subarray(0, SAMPLE_MENU.length >> 1);
  assert.equal(
    checkMenuPdfBytes(concat(half, new Uint8Array(9000))),
    "incomplete",
  );
});

test("a linearized PDF is judged by its tail: its first-page trailer is near the start", () => {
  assert.equal(checkMenuPdfBytes(linearized(10_000)), null);
  // Cut short: only the first-page trailer is left, and it must not vouch.
  assert.equal(checkMenuPdfBytes(linearized(10_000, "")), "incomplete");
  // The tail window is the last 4096 bytes: "%%EOF" must still be inside it.
  const eof = (after) => linearized(10_000, "%%EOF" + "\0".repeat(after));
  assert.equal(checkMenuPdfBytes(eof(4091)), null);
  assert.equal(checkMenuPdfBytes(eof(4092)), "incomplete");
});

test("the whole-file fallback accepts either marker, and only a /Linearized in the first KB counts", () => {
  const padded = (marker) =>
    concat(bytes(`%PDF-1.4\n${marker}\n`), new Uint8Array(5000));
  assert.equal(checkMenuPdfBytes(padded("startxref")), null);
  assert.equal(checkMenuPdfBytes(padded("%%EOF")), null);
  assert.equal(checkMenuPdfBytes(padded("nothing here")), "incomplete");
  // A /Linearized past byte 1024 is not a linearization dictionary.
  const late = concat(
    bytes("%PDF-1.4\n"),
    new Uint8Array(1100),
    bytes("/Linearized\nstartxref\n"),
    new Uint8Array(5000),
  );
  assert.equal(checkMenuPdfBytes(late), null);
});

test("known limit: a cut-short copy whose body merely mentions the markers still passes", () => {
  // The fallback cannot tell text that mentions startxref from a real trailer.
  // Real producers write none mid-file; uncompressed text and embedded
  // uncompressed PDFs do. Rare, and the price of not refusing padded files.
  const body = bytes("%PDF-1.4\n(see startxref and %%EOF in the spec)\n");
  assert.equal(checkMenuPdfBytes(concat(body, new Uint8Array(5000))), null);
});

test("exactly 10 MiB is accepted and one byte more is not", async () => {
  const atCap = new Uint8Array(MAX_MENU_PDF_BYTES);
  atCap.set(bytes("%PDF-1.4\n"), 0);
  atCap.set(bytes("startxref\n%%EOF\n"), MAX_MENU_PDF_BYTES - 16);
  assert.equal(checkMenuPdfBytes(atCap), null);
  assert.equal((await readMenuPdf(new File([atCap], "menu.pdf"))).ok, true);
  assert.equal(
    checkMenuPdfBytes(new Uint8Array(MAX_MENU_PDF_BYTES + 1)),
    "tooLarge",
  );
});

test("startxref without %%EOF still counts as complete (PDFium opens it)", () => {
  assert.equal(
    checkMenuPdfBytes(bytes("%PDF-1.4\nbody\nstartxref\n9\n")),
    null,
  );
});

test("a file over the cap is tooLarge", () => {
  assert.equal(
    checkMenuPdfBytes(new Uint8Array(MAX_MENU_PDF_BYTES + 1)),
    "tooLarge",
  );
});

test("readMenuPdf returns the very bytes it checked", async () => {
  const file = new File([SAMPLE_MENU], "menu.pdf", { type: "application/pdf" });
  const result = await readMenuPdf(file);
  assert.equal(result.ok, true);
  assert.ok(result.bytes instanceof ArrayBuffer);
  assert.equal(
    Buffer.compare(Buffer.from(result.bytes), Buffer.from(SAMPLE_MENU)),
    0,
  );
});

test("readMenuPdf reads the file once, so what it checked is what the caller gets", async () => {
  // A file can change on disk between two reads. If the bytes handed back came
  // from a second read, the check would vouch for bytes it never saw.
  let reads = 0;
  const changesOnDisk = {
    size: SAMPLE_MENU.length,
    arrayBuffer: async () => {
      reads += 1;
      return reads === 1 ? SAMPLE_MENU.slice().buffer : new ArrayBuffer(0);
    },
  };
  const result = await readMenuPdf(changesOnDisk);
  assert.equal(reads, 1);
  assert.equal(result.ok, true);
  assert.equal(
    Buffer.compare(Buffer.from(result.bytes), Buffer.from(SAMPLE_MENU)),
    0,
  );
});

test("readMenuPdf rejects a non-PDF named .pdf and an unfinished PDF", async () => {
  const text = new File([bytes("hello")], "menu.pdf", {
    type: "application/pdf",
  });
  assert.deepEqual(await readMenuPdf(text), { ok: false, problem: "notPdf" });

  const cut = new File([SAMPLE_MENU.subarray(0, 4096)], "menu.pdf");
  assert.deepEqual(await readMenuPdf(cut), {
    ok: false,
    problem: "incomplete",
  });
});

test("readMenuPdf refuses an oversize file without reading it", async () => {
  let read = false;
  const huge = {
    size: MAX_MENU_PDF_BYTES + 1,
    arrayBuffer: async () => {
      read = true;
      return new ArrayBuffer(0);
    },
  };
  assert.deepEqual(await readMenuPdf(huge), { ok: false, problem: "tooLarge" });
  assert.equal(read, false);
});

test("a file the browser can no longer read is unreadable, not a crash", async () => {
  const moved = {
    size: 1234,
    arrayBuffer: () =>
      Promise.reject(new DOMException("moved or locked", "NotReadableError")),
  };
  assert.deepEqual(await readMenuPdf(moved), {
    ok: false,
    problem: "unreadable",
  });
});
