// PDF rendering for the finance module (C42): register and report tables
// (A4 landscape) and invoices (A4 portrait), with the MyBakuriani logo and the
// bundled Noto Sans Georgian. Server only: like the OG card route it reads
// the fonts and the logo from the checkout at runtime.
//
// The font covers Georgian, Latin, digits, punctuation and ₾ but no
// Cyrillic, so Cyrillic is transliterated to Latin and any other missing
// glyph becomes "?" (a name never turns into invisible boxes).

import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  degrees,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { formatMoney, formatPercent } from "@/lib/finance/money";

export type PdfCellKind = "text" | "money" | "number";

export type PdfColumn = {
  header: string;
  kind: PdfCellKind;
  /** Relative width (text 2, numbers 1 by default). */
  weight?: number;
};

export type PdfTableInput = {
  title: string;
  /** Lines under the title: period, filters, generated at. */
  meta: string[];
  columns: PdfColumn[];
  rows: readonly (readonly unknown[])[];
  /** A bold last row (its first cell is the label). */
  totals?: readonly unknown[] | null;
  /** Printed after the table (the informational-only disclaimer). */
  footnote?: string | null;
  pageLabel: (page: number, pages: number) => string;
};

export type InvoicePdfLabels = {
  title: string;
  draft: string;
  cancelled: string;
  issueDate: string;
  dueDate: string;
  status: string;
  issuer: string;
  recipient: string;
  taxId: string;
  address: string;
  email: string;
  phone: string;
  bank: string;
  iban: string;
  swift: string;
  itemNo: string;
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  subtotal: string;
  discount: string;
  vat: string;
  total: string;
  paid: string;
  remaining: string;
  paymentMethod: string;
  relatedReference: string;
  linkedTransaction: string;
  notes: string;
  terms: string;
  disclaimer: string;
  page: (page: number, pages: number) => string;
};

export type InvoicePdfParty = {
  name: string | null;
  taxId: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  bankName?: string | null;
  bankIban?: string | null;
  bankSwift?: string | null;
};

export type InvoicePdfData = {
  number: string | null;
  statusLabel: string;
  watermark: "draft" | "cancelled" | null;
  issueDate: string | null;
  dueDate: string | null;
  issuer: InvoicePdfParty;
  recipient: InvoicePdfParty;
  items: {
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
  }[];
  subtotal: number;
  discount: number;
  vatRate: number | null;
  vat: number;
  total: number;
  /** Null for a draft (nothing can be paid yet). */
  paid: number | null;
  remaining: number | null;
  paymentMethodLabel: string | null;
  relatedReference: string | null;
  linkedTransaction: string | null;
  notes: string | null;
  terms: string | null;
};

const INK = rgb(15 / 255, 23 / 255, 42 / 255); // #0F172A
const MUTED = rgb(100 / 255, 116 / 255, 139 / 255); // #64748B
const LINE = rgb(226 / 255, 232 / 255, 240 / 255); // #E2E8F0
const HEAD_BG = rgb(241 / 255, 245 / 255, 249 / 255); // #F1F5F9
const ZEBRA = rgb(248 / 255, 250 / 255, 252 / 255); // #F8FAFC
const BRAND = rgb(14 / 255, 33 / 255, 80 / 255); // #0E2150
const ACCENT = rgb(37 / 255, 99 / 255, 235 / 255); // #2563EB
const DANGER = rgb(185 / 255, 28 / 255, 28 / 255); // #B91C1C
const WHITE = rgb(1, 1, 1);

const LOGO_RATIO = 1240 / 500;

type Assets = { regular: Buffer; bold: Buffer; logo: Buffer };
let assetsPromise: Promise<Assets> | null = null;

function loadAssets(): Promise<Assets> {
  assetsPromise ??= (async () => {
    const root = process.cwd();
    const [regular, bold, logo] = await Promise.all([
      readFile(
        path.join(root, "src/assets/fonts/NotoSansGeorgian-Regular.ttf"),
      ),
      readFile(path.join(root, "src/assets/fonts/NotoSansGeorgian-Bold.ttf")),
      readFile(path.join(root, "public/logo.png")),
    ]);
    return { regular, bold, logo };
  })().catch((error: unknown) => {
    assetsPromise = null;
    throw error;
  });
  return assetsPromise;
}

const CYRILLIC = "абвгдеёжзийклмнопрстуфхцчшщъыьэюяіїєґ";
const CYRILLIC_LATIN = [
  "a",
  "b",
  "v",
  "g",
  "d",
  "e",
  "yo",
  "zh",
  "z",
  "i",
  "y",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "r",
  "s",
  "t",
  "u",
  "f",
  "kh",
  "ts",
  "ch",
  "sh",
  "shch",
  "",
  "y",
  "",
  "e",
  "yu",
  "ya",
  "i",
  "yi",
  "ye",
  "g",
];

type Ctx = {
  doc: PDFDocument;
  regular: PDFFont;
  bold: PDFFont;
  logo: PDFImage;
  clean: (text: string) => string;
};

async function createContext(title: string): Promise<Ctx> {
  const assets = await loadAssets();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(assets.regular, { subset: true });
  const bold = await doc.embedFont(assets.bold, { subset: true });
  const logo = await doc.embedPng(assets.logo);
  doc.setTitle(title);
  doc.setAuthor("MyBakuriani");
  doc.setCreator("MyBakuriani");
  doc.setProducer("MyBakuriani");
  doc.setLanguage("ka");
  const now = new Date();
  doc.setCreationDate(now);
  doc.setModificationDate(now);

  const charset = new Set(regular.getCharacterSet());
  const clean = (text: string) => {
    let out = "";
    for (const ch of text.replace(/[\t\r\v\f]/g, " ")) {
      if (ch === "\n" || charset.has(ch.codePointAt(0) ?? 0)) {
        out += ch;
        continue;
      }
      const lower = ch.toLowerCase();
      const index = CYRILLIC.indexOf(lower);
      if (index >= 0) {
        const latin = CYRILLIC_LATIN[index];
        out +=
          ch === lower ? latin : latin.charAt(0).toUpperCase() + latin.slice(1);
        continue;
      }
      out += "?";
    }
    return out;
  };
  return { doc, regular, bold, logo, clean };
}

const advances = new WeakMap<PDFFont, Map<string, number>>();

/**
 * Width of `text` at `size` as the sum of per-character advances, cached per
 * font. Equal to pdf-lib's widthOfTextAtSize for these fonts (no kerning is
 * applied), but without a fontkit layout per call: measuring every wrap
 * candidate that way made a 5000-row table take 16 s.
 */
function textWidth(font: PDFFont, text: string, size: number): number {
  let table = advances.get(font);
  if (!table) {
    table = new Map();
    advances.set(font, table);
  }
  let width = 0;
  for (const ch of text) {
    let advance = table.get(ch);
    if (advance === undefined) {
      advance = font.widthOfTextAtSize(ch, 1);
      table.set(ch, advance);
    }
    width += advance;
  }
  return width * size;
}

/** Lines of `text` (already cleaned) that fit maxWidth; \n starts a line. */
function wrap(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(font, candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      let rest = word;
      while (rest.length > 1 && textWidth(font, rest, size) > maxWidth) {
        let cut = rest.length - 1;
        while (
          cut > 1 &&
          textWidth(font, rest.slice(0, cut), size) > maxWidth
        ) {
          cut -= 1;
        }
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

function clampLines(
  lines: string[],
  max: number,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max);
  let last = kept[max - 1];
  while (last && textWidth(font, `${last}…`, size) > maxWidth) {
    last = last.slice(0, -1);
  }
  kept[max - 1] = `${last}…`;
  return kept;
}

function amountText(value: number): string {
  return formatMoney(value).replace(" ₾", "");
}

function cellText(value: unknown, kind: PdfCellKind): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (kind === "money") return amountText(value);
    return Number.isFinite(value) ? String(value) : "";
  }
  return String(value);
}

function drawRight(
  page: PDFPage,
  text: string,
  right: number,
  y: number,
  font: PDFFont,
  size: number,
  color = INK,
) {
  page.drawText(text, {
    x: right - textWidth(font, text, size),
    y,
    size,
    font,
    color,
  });
}

function drawFooters(
  ctx: Ctx,
  left: string,
  pageLabel: (page: number, pages: number) => string,
  margin: number,
) {
  const pages = ctx.doc.getPages();
  pages.forEach((page, index) => {
    const { width } = page.getSize();
    page.drawLine({
      start: { x: margin, y: margin - 4 },
      end: { x: width - margin, y: margin - 4 },
      thickness: 0.5,
      color: LINE,
    });
    page.drawText(ctx.clean(left), {
      x: margin,
      y: margin - 14,
      size: 7,
      font: ctx.regular,
      color: MUTED,
    });
    drawRight(
      page,
      ctx.clean(pageLabel(index + 1, pages.length)),
      width - margin,
      margin - 14,
      ctx.regular,
      7,
      MUTED,
    );
  });
}

// ---------------------------------------------------------------------------
// Register / report tables
// ---------------------------------------------------------------------------

const TABLE_PAGE: [number, number] = [841.89, 595.28];
const TABLE_MARGIN = 28;
const BODY_SIZE = 7.5;
const LINE_HEIGHT = BODY_SIZE * 1.35;
const PAD_X = 4;
const PAD_Y = 3;
const MAX_CELL_LINES = 4;

export async function renderTablePdf(
  input: PdfTableInput,
): Promise<Uint8Array> {
  const ctx = await createContext(input.title);
  const [W, H] = TABLE_PAGE;
  const M = TABLE_MARGIN;
  const tableWidth = W - 2 * M;
  const weights = input.columns.map(
    (col) => col.weight ?? (col.kind === "text" ? 2 : 1),
  );
  const weightSum = weights.reduce((sum, w) => sum + w, 0) || 1;
  const widths = weights.map((w) => (w / weightSum) * tableWidth);
  const xs = widths.map((_, i) =>
    widths.slice(0, i).reduce((sum, w) => sum + w, M),
  );
  const bottom = M + 6;

  let page = ctx.doc.addPage(TABLE_PAGE);
  let y = H - M;

  // First page: logo, title, meta lines.
  const logoHeight = 28;
  page.drawImage(ctx.logo, {
    x: M,
    y: y - logoHeight,
    width: logoHeight * LOGO_RATIO,
    height: logoHeight,
  });
  y -= logoHeight + 18;
  for (const line of wrap(ctx.clean(input.title), ctx.bold, 14, tableWidth)) {
    page.drawText(line, { x: M, y, size: 14, font: ctx.bold, color: BRAND });
    y -= 18;
  }
  for (const meta of input.meta) {
    for (const line of wrap(ctx.clean(meta), ctx.regular, 8, tableWidth)) {
      page.drawText(line, {
        x: M,
        y,
        size: 8,
        font: ctx.regular,
        color: MUTED,
      });
      y -= 11;
    }
  }
  y -= 6;

  const cellLines = (row: readonly unknown[], font: PDFFont) =>
    input.columns.map((col, i) =>
      clampLines(
        wrap(
          ctx.clean(cellText(row[i], col.kind)),
          font,
          BODY_SIZE,
          widths[i] - 2 * PAD_X,
        ),
        MAX_CELL_LINES,
        font,
        BODY_SIZE,
        widths[i] - 2 * PAD_X,
      ),
    );
  const rowHeight = (lines: string[][]) =>
    Math.max(1, ...lines.map((cell) => cell.length)) * LINE_HEIGHT + 2 * PAD_Y;

  const headerLines = cellLines(
    input.columns.map((col) => col.header),
    ctx.bold,
  );
  const headerHeight = rowHeight(headerLines);

  const drawRow = (
    lines: string[][],
    height: number,
    font: PDFFont,
    background: ReturnType<typeof rgb> | null,
  ) => {
    if (background) {
      page.drawRectangle({
        x: M,
        y: y - height,
        width: tableWidth,
        height,
        color: background,
      });
    }
    lines.forEach((cell, i) => {
      const numeric = input.columns[i].kind !== "text";
      cell.forEach((text, lineIndex) => {
        const ty = y - PAD_Y - BODY_SIZE - lineIndex * LINE_HEIGHT + 1;
        if (numeric) {
          drawRight(page, text, xs[i] + widths[i] - PAD_X, ty, font, BODY_SIZE);
        } else {
          page.drawText(text, {
            x: xs[i] + PAD_X,
            y: ty,
            size: BODY_SIZE,
            font,
            color: INK,
          });
        }
      });
    });
    page.drawLine({
      start: { x: M, y: y - height },
      end: { x: M + tableWidth, y: y - height },
      thickness: 0.4,
      color: LINE,
    });
    y -= height;
  };

  const drawHeader = () =>
    drawRow(headerLines, headerHeight, ctx.bold, HEAD_BG);

  const newPage = () => {
    page = ctx.doc.addPage(TABLE_PAGE);
    y = H - M;
    page.drawText(ctx.clean(input.title), {
      x: M,
      y: y - 9,
      size: 9,
      font: ctx.bold,
      color: BRAND,
    });
    y -= 20;
    drawHeader();
  };

  drawHeader();
  input.rows.forEach((row, index) => {
    const lines = cellLines(row, ctx.regular);
    const height = rowHeight(lines);
    if (y - height < bottom) newPage();
    drawRow(lines, height, ctx.regular, index % 2 === 1 ? ZEBRA : null);
  });
  if (input.totals) {
    const lines = cellLines(input.totals, ctx.bold);
    const height = rowHeight(lines);
    if (y - height < bottom) newPage();
    page.drawLine({
      start: { x: M, y },
      end: { x: M + tableWidth, y },
      thickness: 1,
      color: INK,
    });
    drawRow(lines, height, ctx.bold, HEAD_BG);
  }
  if (input.footnote) {
    const lines = wrap(ctx.clean(input.footnote), ctx.regular, 7.5, tableWidth);
    if (y - (lines.length * 10 + 10) < bottom) {
      page = ctx.doc.addPage(TABLE_PAGE);
      y = H - M;
    }
    y -= 10;
    for (const line of lines) {
      page.drawText(line, {
        x: M,
        y: y - 7.5,
        size: 7.5,
        font: ctx.regular,
        color: MUTED,
      });
      y -= 10;
    }
  }

  drawFooters(ctx, `MyBakuriani — ${input.title}`, input.pageLabel, M);
  return ctx.doc.save();
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

const INVOICE_PAGE: [number, number] = [595.28, 841.89];
const INVOICE_MARGIN = 40;

function quantityText(value: number): string {
  return String(Number(value.toFixed(3)));
}

export async function renderInvoicePdf(
  data: InvoicePdfData,
  labels: InvoicePdfLabels,
): Promise<Uint8Array> {
  const title = data.number ? `${labels.title} ${data.number}` : labels.title;
  const ctx = await createContext(title);
  const [W, H] = INVOICE_PAGE;
  const M = INVOICE_MARGIN;
  const contentWidth = W - 2 * M;
  const t = ctx.clean;
  // The disclaimer (spec §20) sits above the footer of every page.
  const disclaimer = wrap(t(labels.disclaimer), ctx.regular, 7, contentWidth);
  const bottom = M + 14 + disclaimer.length * 9;

  let page = ctx.doc.addPage(INVOICE_PAGE);
  let y = H - M;

  const watermark = (target: PDFPage) => {
    if (!data.watermark) return;
    const text = t(
      data.watermark === "draft" ? labels.draft : labels.cancelled,
    );
    const size = 72;
    const width = textWidth(ctx.bold, text, size);
    target.drawText(text, {
      x: W / 2 - (width / 2) * Math.cos(Math.PI / 6),
      y: H / 2 - (width / 2) * Math.sin(Math.PI / 6),
      size,
      font: ctx.bold,
      color: data.watermark === "draft" ? ACCENT : DANGER,
      opacity: 0.08,
      rotate: degrees(30),
    });
  };

  const newPage = () => {
    page = ctx.doc.addPage(INVOICE_PAGE);
    watermark(page);
    y = H - M;
    page.drawText(t(title), {
      x: M,
      y: y - 9,
      size: 9,
      font: ctx.bold,
      color: BRAND,
    });
    y -= 24;
  };
  const ensure = (height: number) => {
    if (y - height < bottom) newPage();
  };

  watermark(page);

  // Header: logo left; title, number and status right.
  const logoHeight = 36;
  page.drawImage(ctx.logo, {
    x: M,
    y: y - logoHeight,
    width: logoHeight * LOGO_RATIO,
    height: logoHeight,
  });
  drawRight(page, t(labels.title), W - M, y - 18, ctx.bold, 20, BRAND);
  drawRight(
    page,
    t(data.number ? `№ ${data.number}` : labels.draft),
    W - M,
    y - 34,
    ctx.bold,
    11,
  );
  drawRight(
    page,
    t(`${labels.status}: ${data.statusLabel}`),
    W - M,
    y - 48,
    ctx.regular,
    9,
    MUTED,
  );
  y -= 70;

  // Dates.
  const dates: [string, string | null][] = [
    [labels.issueDate, data.issueDate],
    [labels.dueDate, data.dueDate],
  ];
  dates.forEach(([label, value], index) => {
    const x = M + index * 150;
    page.drawText(t(label), {
      x,
      y,
      size: 7.5,
      font: ctx.regular,
      color: MUTED,
    });
    page.drawText(t(value ?? "—"), {
      x,
      y: y - 13,
      size: 10,
      font: ctx.bold,
      color: INK,
    });
  });
  y -= 34;

  // Issuer | recipient.
  const columnWidth = (contentWidth - 24) / 2;
  const partyLines = (party: InvoicePdfParty) => {
    const rows: [string, string | null | undefined][] = [
      [labels.taxId, party.taxId],
      [labels.address, party.address],
      [labels.email, party.email],
      [labels.phone, party.phone],
      [labels.bank, party.bankName],
      [labels.iban, party.bankIban],
      [labels.swift, party.bankSwift],
    ];
    const lines: { text: string; bold: boolean }[] = [];
    for (const line of wrap(t(party.name ?? "—"), ctx.bold, 10, columnWidth)) {
      lines.push({ text: line, bold: true });
    }
    for (const [label, value] of rows) {
      if (!value) continue;
      for (const line of wrap(
        t(`${label}: ${value}`),
        ctx.regular,
        8.5,
        columnWidth,
      )) {
        lines.push({ text: line, bold: false });
      }
    }
    return lines;
  };
  const parties: [string, { text: string; bold: boolean }[]][] = [
    [labels.issuer, partyLines(data.issuer)],
    [labels.recipient, partyLines(data.recipient)],
  ];
  const partyHeight =
    18 + Math.max(...parties.map(([, lines]) => lines.length)) * 12.5;
  ensure(partyHeight + 26);
  parties.forEach(([heading, lines], index) => {
    const x = M + index * (columnWidth + 24);
    page.drawRectangle({
      x: x - 8,
      y: y - partyHeight - 6,
      width: columnWidth + 16,
      height: partyHeight + 14,
      color: ZEBRA,
      borderColor: LINE,
      borderWidth: 0.6,
    });
    page.drawText(t(heading), {
      x,
      y: y - 4,
      size: 7.5,
      font: ctx.bold,
      color: ACCENT,
    });
    lines.forEach((line, lineIndex) => {
      page.drawText(line.text, {
        x,
        y: y - 20 - lineIndex * 12.5,
        size: line.bold ? 10 : 8.5,
        font: line.bold ? ctx.bold : ctx.regular,
        color: INK,
      });
    });
  });
  y -= partyHeight + 26;

  // Items.
  const cols = [
    { label: labels.itemNo, width: 26, right: false },
    {
      label: labels.description,
      width: contentWidth - 26 - 56 - 84 - 90,
      right: false,
    },
    { label: labels.quantity, width: 56, right: true },
    { label: labels.unitPrice, width: 84, right: true },
    { label: labels.amount, width: 90, right: true },
  ];
  const colX = cols.map((_, i) =>
    cols.slice(0, i).reduce((sum, col) => sum + col.width, M),
  );
  const ITEM_SIZE = 9;
  const ITEM_LINE = ITEM_SIZE * 1.35;
  const drawItemsHeader = () => {
    const height = 20;
    page.drawRectangle({
      x: M,
      y: y - height,
      width: contentWidth,
      height,
      color: BRAND,
    });
    cols.forEach((col, i) => {
      const text = t(col.label);
      if (col.right) {
        drawRight(
          page,
          text,
          colX[i] + col.width - 6,
          y - 13.5,
          ctx.bold,
          8,
          WHITE,
        );
      } else {
        page.drawText(text, {
          x: colX[i] + 6,
          y: y - 13.5,
          size: 8,
          font: ctx.bold,
          color: WHITE,
        });
      }
    });
    y -= height;
  };
  ensure(60);
  drawItemsHeader();
  data.items.forEach((item, index) => {
    const descLines = wrap(
      t(item.description),
      ctx.regular,
      ITEM_SIZE,
      cols[1].width - 12,
    );
    const height = descLines.length * ITEM_LINE + 10;
    if (y - height < bottom) {
      newPage();
      drawItemsHeader();
    }
    if (index % 2 === 1) {
      page.drawRectangle({
        x: M,
        y: y - height,
        width: contentWidth,
        height,
        color: ZEBRA,
      });
    }
    const ty = y - 5 - ITEM_SIZE + 1;
    page.drawText(String(index + 1), {
      x: colX[0] + 6,
      y: ty,
      size: ITEM_SIZE,
      font: ctx.regular,
      color: MUTED,
    });
    descLines.forEach((line, lineIndex) => {
      page.drawText(line, {
        x: colX[1] + 6,
        y: ty - lineIndex * ITEM_LINE,
        size: ITEM_SIZE,
        font: ctx.regular,
        color: INK,
      });
    });
    const numbers = [
      quantityText(item.quantity),
      amountText(item.unit_price),
      amountText(item.amount),
    ];
    numbers.forEach((text, i) => {
      drawRight(
        page,
        text,
        colX[i + 2] + cols[i + 2].width - 6,
        ty,
        ctx.regular,
        ITEM_SIZE,
      );
    });
    page.drawLine({
      start: { x: M, y: y - height },
      end: { x: M + contentWidth, y: y - height },
      thickness: 0.4,
      color: LINE,
    });
    y -= height;
  });
  y -= 10;

  // Totals (right column).
  const totals: { label: string; value: string; strong?: boolean }[] = [
    { label: labels.subtotal, value: formatMoney(data.subtotal) },
  ];
  if (data.discount > 0) {
    totals.push({
      label: labels.discount,
      value: formatMoney(-data.discount),
    });
  }
  if (data.vatRate !== null) {
    totals.push({
      label: `${labels.vat} ${formatPercent(data.vatRate)}`,
      value: formatMoney(data.vat),
    });
  }
  totals.push({
    label: labels.total,
    value: formatMoney(data.total),
    strong: true,
  });
  if (data.paid !== null && data.remaining !== null) {
    totals.push({ label: labels.paid, value: formatMoney(data.paid) });
    totals.push({
      label: labels.remaining,
      value: formatMoney(data.remaining),
    });
  }
  const totalsX = M + contentWidth - 240;
  ensure(totals.length * 17 + 10);
  for (const row of totals) {
    if (row.strong) {
      page.drawLine({
        start: { x: totalsX, y: y + 2 },
        end: { x: M + contentWidth, y: y + 2 },
        thickness: 1,
        color: INK,
      });
    }
    const size = row.strong ? 11.5 : 9;
    const font = row.strong ? ctx.bold : ctx.regular;
    page.drawText(t(row.label), {
      x: totalsX,
      y: y - size,
      size,
      font,
      color: row.strong ? BRAND : MUTED,
    });
    drawRight(page, t(row.value), M + contentWidth, y - size, font, size);
    y -= row.strong ? 22 : 16;
  }
  y -= 8;

  // Payment and references.
  const facts: [string, string | null][] = [
    [labels.paymentMethod, data.paymentMethodLabel],
    [labels.relatedReference, data.relatedReference],
    [labels.linkedTransaction, data.linkedTransaction],
  ];
  for (const [label, value] of facts) {
    if (!value) continue;
    const lines = wrap(t(`${label}: ${value}`), ctx.regular, 9, contentWidth);
    ensure(lines.length * 13);
    for (const line of lines) {
      page.drawText(line, {
        x: M,
        y: y - 9,
        size: 9,
        font: ctx.regular,
        color: INK,
      });
      y -= 13;
    }
  }

  // Notes and terms.
  const paragraphs: [string, string | null][] = [
    [labels.notes, data.notes],
    [labels.terms, data.terms],
  ];
  for (const [label, value] of paragraphs) {
    if (!value) continue;
    y -= 6;
    ensure(28);
    page.drawText(t(label), {
      x: M,
      y: y - 8,
      size: 8,
      font: ctx.bold,
      color: ACCENT,
    });
    y -= 14;
    for (const line of wrap(t(value), ctx.regular, 8.5, contentWidth)) {
      ensure(12);
      page.drawText(line, {
        x: M,
        y: y - 8.5,
        size: 8.5,
        font: ctx.regular,
        color: INK,
      });
      y -= 12;
    }
  }

  for (const target of ctx.doc.getPages()) {
    disclaimer.forEach((line, index) => {
      target.drawText(line, {
        x: M,
        y: M + 8 + (disclaimer.length - 1 - index) * 9,
        size: 7,
        font: ctx.regular,
        color: MUTED,
      });
    });
  }
  drawFooters(ctx, title, labels.page, M);
  return ctx.doc.save();
}
