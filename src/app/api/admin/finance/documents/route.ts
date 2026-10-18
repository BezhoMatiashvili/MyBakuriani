import { createHash, randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  checkOwnershipDocumentBytes,
  OWNERSHIP_DOCUMENT_EXTENSIONS,
} from "@/lib/ownership/document-file";
import {
  DOCUMENT_TYPES,
  MAX_FINANCE_DOCUMENT_BYTES,
} from "@/lib/finance/constants";
import { isIsoDate, parseFinanceFilters } from "@/lib/finance/filters";
import {
  documentLinks,
  listDocuments,
  type DocumentLinkKind,
} from "@/lib/finance/server/data";
import {
  FinanceInputError,
  financeErrorResponse,
  jsonError,
  readMoney,
  readOneOf,
  readText,
  readUuid,
  requireText,
} from "@/lib/finance/server/http";
import { FILTER_LISTS } from "@/lib/finance/server/reports";

export const runtime = "nodejs";

// The primary documents archive (spec §12, C42). Files live in the private
// `finance-documents` bucket, which has no storage policy at all: only these
// service-role routes read or write it. A document is never deleted; a wrong
// one is voided with a reason (POST /documents/[id]).

const LINK_COLUMNS: Record<DocumentLinkKind, string> = {
  entry: "entry_id",
  expense: "expense_id",
  invoice: "invoice_id",
  payment: "payment_id",
  refund: "refund_id",
};

export async function GET(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const params = new URL(request.url).searchParams;
  const db = createServiceClient();
  try {
    const filters = parseFinanceFilters(params, FILTER_LISTS.documents);
    const page = await listDocuments(db, filters);
    const links = await documentLinks(db, page.rows);
    return Response.json({
      ...page,
      rows: page.rows.map((row) => ({
        ...row,
        link: links.get(row.id) ?? null,
      })),
    });
  } catch (error) {
    return financeErrorResponse(error, "documents list");
  }
}

function fileName(name: string, ext: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001F\u007F/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 255);
  return cleaned || `document.${ext}`;
}

// POST multipart: file, doc_type, title, document_number?, document_date?,
// counterparty?, amount?, link_kind?, link_id?
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const adminId = guard.admin.userId;
  const allowed = await checkRateLimit(
    `finance-document-upload:admin:${adminId}`,
    60,
    3_600_000,
  );
  if (!allowed) return jsonError("rate_limited", 429);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("invalid_request", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("invalid_file", 400);
  if (file.size > MAX_FINANCE_DOCUMENT_BYTES) {
    return jsonError("file_tooLarge", 413);
  }

  const db = createServiceClient(adminId);
  let path: string | null = null;
  try {
    const field = (key: string) => {
      const value = form.get(key);
      return typeof value === "string" ? value : null;
    };
    const docType = readOneOf(field("doc_type"), DOCUMENT_TYPES, "doc_type");
    const title = requireText(field("title"), "title", 200);
    const documentDate = field("document_date") || null;
    if (documentDate && !isIsoDate(documentDate)) {
      throw new FinanceInputError("invalid_date");
    }
    const amountText = field("amount");
    const amount = amountText
      ? readMoney(amountText, "amount", { max: 100_000_000 })
      : null;
    const linkKind = field("link_kind") || null;
    const linkId = readUuid(field("link_id"), "link");
    const link: Record<string, string> = {};
    if (linkKind || linkId) {
      const kind = readOneOf(
        linkKind,
        Object.keys(LINK_COLUMNS) as DocumentLinkKind[],
        "link",
      );
      if (!linkId) throw new FinanceInputError("invalid_link");
      link[LINK_COLUMNS[kind]] = linkId;
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = checkOwnershipDocumentBytes(bytes);
    if (!check.ok) return jsonError(`file_${check.problem}`, 422);

    const id = randomUUID();
    const ext = OWNERSHIP_DOCUMENT_EXTENSIONS[check.type];
    path = `${id}.${ext}`;
    const upload = await db.storage
      .from("finance-documents")
      .upload(path, bytes, {
        contentType: check.contentType,
        upsert: false,
        cacheControl: "60",
      });
    if (upload.error) throw upload.error;

    const { data, error } = await db
      .from("finance_documents")
      .insert({
        id,
        doc_type: docType,
        title,
        document_number: readText(
          field("document_number"),
          "document_number",
          100,
        ),
        document_date: documentDate,
        counterparty: readText(field("counterparty"), "counterparty", 200),
        amount,
        storage_path: path,
        file_name: fileName(file.name, ext),
        content_type: check.contentType,
        byte_size: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        uploaded_by: adminId,
        ...link,
      })
      .select("id, document_no")
      .single();
    if (error) throw error;
    return Response.json(data, { status: 201 });
  } catch (error) {
    // The object was stored but no row points at it: remove it again.
    if (path) await db.storage.from("finance-documents").remove([path]);
    return financeErrorResponse(error, "document upload");
  }
}
