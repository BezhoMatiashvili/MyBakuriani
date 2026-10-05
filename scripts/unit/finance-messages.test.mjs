// Finance module (C42) message keys. The exports, PDFs and pages build many
// keys from data (`revenueTypes.${type}`), which typecheck cannot see and
// next-intl does not reject: a missing key prints its own path into a PDF.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import {
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  EXPENSE_CATEGORIES,
  INVOICE_DISPLAY_STATUSES,
  INVOICE_PDF_LABEL_KEYS,
  INVOICE_VIEWS,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  REFUND_SOURCES,
  REFUND_STATUSES,
  REPORT_KEYS,
  REVENUE_TYPES,
  REVIEW_FLAGS,
  SOURCE_STATUSES,
} from "../../src/lib/finance/constants.ts";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const catalogs = Object.fromEntries(
  ["ka", "en", "ru"].map((l) => [l, JSON.parse(read(`messages/${l}.json`))]),
);

function get(obj, path) {
  return path
    .split(".")
    .reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);
}

function missingKeys(namespace, keys) {
  const problems = [];
  for (const [lang, messages] of Object.entries(catalogs)) {
    for (const key of keys) {
      const value = get(messages[namespace], key);
      if (typeof value !== "string" || !value.trim()) {
        problems.push(`${lang}: ${namespace}.${key}`);
      }
    }
  }
  return problems;
}

test("every vocabulary value and report has a label", () => {
  const groups = {
    revenueTypes: REVENUE_TYPES,
    methods: PAYMENT_METHODS,
    paymentStatuses: PAYMENT_STATUSES,
    refundStatuses: REFUND_STATUSES,
    sources: REFUND_SOURCES,
    sourceStatuses: SOURCE_STATUSES,
    reviewFlags: REVIEW_FLAGS,
    expenseCategories: EXPENSE_CATEGORIES,
    documentTypes: DOCUMENT_TYPES,
    documentStatuses: DOCUMENT_STATUSES,
    invoiceStatuses: INVOICE_DISPLAY_STATUSES,
    invoiceViews: INVOICE_VIEWS,
    reports: REPORT_KEYS,
    "exportPage.hints": REPORT_KEYS,
  };
  const keys = Object.entries(groups).flatMap(([group, values]) =>
    values.map((v) => `${group}.${v}`),
  );
  assert.deepEqual(missingKeys("AdminFinances", keys), []);
  assert.deepEqual(
    missingKeys("AdminInvoices", [
      ...INVOICE_PDF_LABEL_KEYS.map((k) => `pdf.${k}`),
      "pdf.page",
    ]),
    [],
  );
});

test("every FINANCE_* error the database raises has a message", () => {
  const codes = new Set();
  for (const file of readdirSync(new URL("supabase/migrations/", root))) {
    if (!file.includes("finance")) continue;
    for (const match of read(`supabase/migrations/${file}`).matchAll(
      /'(FINANCE_[A-Z_]+)'/g,
    )) {
      codes.add(match[1]);
    }
  }
  assert.ok(codes.size >= 20, `found ${codes.size} codes`);
  assert.deepEqual(
    missingKeys(
      "AdminFinances",
      [...codes].map((c) => `errors.${c}`),
    ),
    [],
  );
});

// Translator variables whose namespace is not declared in the file itself.
const PARAMETER_TRANSLATORS = {
  "src/lib/finance/server/reports.ts": { t: "AdminFinances" },
};

function* sourceFiles(dir) {
  let entries;
  try {
    entries = readdirSync(new URL(dir, root));
  } catch {
    return;
  }
  for (const name of entries) {
    const path = `${dir}/${name}`;
    if (statSync(new URL(path, root)).isDirectory()) yield* sourceFiles(path);
    else if (/\.(ts|tsx)$/.test(name)) yield path;
  }
}

test("every literal key the finance code uses exists in all locales", () => {
  const dirs = [
    "src/lib/finance",
    "src/app/api/admin/finance",
    "src/app/api/invoices",
    "src/app/[locale]/dashboard/admin/finances",
    "src/components/admin/finance",
  ];
  const problems = [];
  let checked = 0;
  for (const dir of dirs) {
    for (const file of sourceFiles(dir)) {
      const source = read(file);
      const translators = { ...(PARAMETER_TRANSLATORS[file] ?? {}) };
      for (const m of source.matchAll(
        /\b(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|financeT|getTranslations)\(\s*(?:"(\w+)")?\s*\)/g,
      )) {
        translators[m[1]] = m[2] ?? "AdminFinances";
      }
      for (const [name, namespace] of Object.entries(translators)) {
        const call = new RegExp(`\\b${name}\\(\\s*"([A-Za-z0-9_.]+)"`, "g");
        for (const m of source.matchAll(call)) {
          checked += 1;
          for (const problem of missingKeys(namespace, [m[1]])) {
            problems.push(`${file}: ${problem}`);
          }
        }
      }
    }
  }
  assert.ok(checked > 50, `only ${checked} keys checked`);
  assert.deepEqual(problems, []);
});
