import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import {
  buildXlsx,
  columnName,
  crc32,
  safeSheetName,
} from "../../src/lib/finance/xlsx.ts";

// Reads a zip through its central directory, checking every CRC.
function unzip(buffer) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd >= 0, "end of central directory");
  const count = buffer.readUInt16LE(eocd + 10);
  let at = buffer.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    assert.equal(buffer.readUInt32LE(at), 0x02014b50);
    const crc = buffer.readUInt32LE(at + 16);
    const size = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const localAt = buffer.readUInt32LE(at + 42);
    const name = buffer.toString("ascii", at + 46, at + 46 + nameLength);
    assert.equal(buffer.readUInt32LE(localAt), 0x04034b50);
    const localName = buffer.readUInt16LE(localAt + 26);
    const localExtra = buffer.readUInt16LE(localAt + 28);
    const start = localAt + 30 + localName + localExtra;
    const data = inflateRawSync(buffer.subarray(start, start + size));
    assert.equal(crc32(data), crc, `crc of ${name}`);
    files.set(name, data.toString("utf8"));
    at += 46 + nameLength;
  }
  return files;
}

test("crc32 matches the standard check value", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  assert.equal(crc32(new Uint8Array()), 0);
});

test("columnName and safeSheetName", () => {
  assert.equal(columnName(0), "A");
  assert.equal(columnName(25), "Z");
  assert.equal(columnName(26), "AA");
  assert.equal(columnName(701), "ZZ");
  assert.equal(columnName(702), "AAA");
  assert.equal(safeSheetName("a/b:c?"), "a b c");
  assert.equal(safeSheetName("x".repeat(40)).length, 31);
  assert.equal(safeSheetName("[]"), "Sheet1");
});

test("buildXlsx writes a valid package with typed cells", () => {
  const buffer = buildXlsx({
    sheetName: "შემოსავლები",
    preamble: ["ანგარიში", "2026-01-01 — 2026-10-05"],
    columns: [
      { header: "თარიღი", kind: "text" },
      { header: "თანხა", kind: "money" },
      { header: "რაოდენობა", kind: "number" },
    ],
    rows: [
      ['<b>&"x"', 12.5, 3],
      ["=SUM(A1)\u0007", -4, null],
      ["text in money", "n/a", Number.NaN],
    ],
  });
  assert.equal(buffer.readUInt32LE(0), 0x04034b50, "zip local header");
  const files = unzip(buffer);
  for (const name of [
    "[Content_Types].xml",
    "_rels/.rels",
    "xl/workbook.xml",
    "xl/_rels/workbook.xml.rels",
    "xl/styles.xml",
    "xl/worksheets/sheet1.xml",
  ]) {
    assert.ok(files.has(name), name);
  }
  assert.match(files.get("xl/workbook.xml"), /name="შემოსავლები"/);
  const sheet = files.get("xl/worksheets/sheet1.xml");
  // Preamble in rows 1-2, a blank row, the header in row 4, frozen below it.
  assert.match(sheet, /<pane ySplit="4" topLeftCell="A5"/);
  assert.match(sheet, /<c r="A4" t="inlineStr" s="1">/);
  // Text is escaped, control characters are dropped, and a formula-looking
  // string stays a string (an inline string is never evaluated).
  assert.match(sheet, /&lt;b&gt;&amp;&quot;x&quot;/);
  assert.match(sheet, /<t xml:space="preserve">=SUM\(A1\)<\/t>/);
  assert.doesNotMatch(sheet, /\u0007/);
  // Numbers are numeric cells; money gets the 2-decimal style.
  assert.match(sheet, /<c r="B5" s="2"><v>12.5<\/v><\/c>/);
  assert.match(sheet, /<c r="C5"><v>3<\/v><\/c>/);
  assert.match(sheet, /<c r="B6" s="2"><v>-4<\/v><\/c>/);
  // Null cells are left out; a non-number in a money column is text.
  assert.doesNotMatch(sheet, /r="C6"/);
  assert.match(
    sheet,
    /<c r="B7" t="inlineStr"><is><t xml:space="preserve">n\/a<\/t>/,
  );
  assert.match(
    sheet,
    /<c r="C7" t="inlineStr"><is><t xml:space="preserve">NaN<\/t>/,
  );
});
