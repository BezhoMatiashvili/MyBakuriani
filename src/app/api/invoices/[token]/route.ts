import { createServiceClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import {
  SHARE_TOKEN_RE,
  hashShareToken,
  invoicePdfBytes,
  loadInvoice,
} from "@/lib/finance/server/invoices";

export const runtime = "nodejs";

// GET /api/invoices/[token] — an invoice's secure link (C42, spec §17): the
// recipient opens the PDF without an account. Only the token's SHA-256 is
// stored; a link works while its invoice is issued or sent and until it
// expires (30 days). Never cached, never indexed.

const HEADERS = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
};

function notFound() {
  return Response.json(
    { error: "not_found" },
    { status: 404, headers: HEADERS },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!SHARE_TOKEN_RE.test(token)) return notFound();
  const allowed = await checkRateLimit(
    `invoice-link:ip:${getClientIp(request)}`,
    30,
    600_000,
  );
  if (!allowed) {
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: HEADERS },
    );
  }

  const db = createServiceClient();
  const { data: link, error } = await db
    .from("invoices")
    .select("id, status, share_expires_at")
    .eq("share_token_hash", hashShareToken(token))
    .maybeSingle();
  if (error) {
    console.error("[invoice-link] lookup failed:", error.message);
    return Response.json(
      { error: "lookup_failed" },
      { status: 500, headers: HEADERS },
    );
  }
  if (
    !link ||
    (link.status !== "issued" && link.status !== "sent") ||
    !link.share_expires_at ||
    Date.parse(link.share_expires_at) <= Date.now()
  ) {
    return notFound();
  }

  try {
    const invoice = await loadInvoice(db, link.id);
    if (!invoice) return notFound();
    const bytes = new Uint8Array(await invoicePdfBytes(db, invoice));
    return new Response(bytes, {
      headers: {
        ...HEADERS,
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoice.invoice_number ?? "invoice"}.pdf"`,
      },
    });
  } catch (renderError) {
    console.error("[invoice-link] render failed:", renderError);
    return Response.json(
      { error: "render_failed" },
      { status: 500, headers: HEADERS },
    );
  }
}
