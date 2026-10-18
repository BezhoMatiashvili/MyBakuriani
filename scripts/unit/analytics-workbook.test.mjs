// Admin analytics exports (C49) write one Excel sheet per report section
// through buildXlsxWorkbook (src/lib/finance/xlsx.ts, additive to C42).
import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import {
  buildXlsx,
  buildXlsxWorkbook,
  crc32,
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

const long = "ძალიან გრძელი სექციის სათაური ორჯერ"; // > 31 characters
const sheet = (sheetName, value) => ({
  sheetName,
  preamble: ["MyBakuriani — ანალიტიკა", "პერიოდი: 2026-09-30 — 2026-10-06"],
  columns: [
    { header: "მაჩვენებელი", kind: "text" },
    { header: "მნიშვნელობა", kind: "number" },
  ],
  rows: [[`უნიკალური მომხმარებლები ${value}`, value]],
});

test("one sheet per section, unique names, every part registered", () => {
  const files = unzip(
    buildXlsxWorkbook([sheet(long, 1), sheet(long, 2), sheet("რეკლამა", 3)]),
  );
  const workbook = files.get("xl/workbook.xml");
  const names = [
    ...workbook.matchAll(
      /<sheet name="([^"]+)" sheetId="(\d+)" r:id="rId(\d+)"\/>/g,
    ),
  ];
  assert.equal(names.length, 3);
  assert.deepEqual(
    names.map((m) => [m[2], m[3]]),
    [
      ["1", "1"],
      ["2", "2"],
      ["3", "3"],
    ],
  );
  const sheetNames = names.map((m) => m[1]);
  for (const name of sheetNames) assert.ok([...name].length <= 31, name);
  assert.equal(
    new Set(sheetNames.map((n) => n.toLowerCase())).size,
    3,
    "names unique ignoring case",
  );
  assert.ok(sheetNames[1].endsWith(" (2)"));
  assert.equal(sheetNames[2], "რეკლამა");

  const types = files.get("[Content_Types].xml");
  const rels = files.get("xl/_rels/workbook.xml.rels");
  for (const n of [1, 2, 3]) {
    assert.ok(types.includes(`/xl/worksheets/sheet${n}.xml`));
    assert.ok(
      rels.includes(`Id="rId${n}"`) &&
        rels.includes(`worksheets/sheet${n}.xml`),
    );
    const xml = files.get(`xl/worksheets/sheet${n}.xml`);
    assert.ok(xml.includes("პერიოდი: 2026-09-30 — 2026-10-06"));
    assert.ok(xml.includes(`უნიკალური მომხმარებლები ${n}`));
  }
  assert.ok(rels.includes('Id="rId4"') && rels.includes("styles.xml"));
  assert.ok(files.has("xl/styles.xml"));
});

test("a one-sheet workbook writes the same sheet as buildXlsx", () => {
  const one = sheet("KPI", 7);
  const single = unzip(buildXlsx(one));
  const book = unzip(buildXlsxWorkbook([one]));
  assert.equal(
    book.get("xl/worksheets/sheet1.xml"),
    single.get("xl/worksheets/sheet1.xml"),
  );
  assert.equal(book.get("xl/styles.xml"), single.get("xl/styles.xml"));
});
