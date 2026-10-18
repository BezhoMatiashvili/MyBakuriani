import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { RECEIVED_PAYMENT_STATUSES } from "@/lib/finance/constants";
import {
  dayEndExclusive,
  dayStart,
  monthStart,
  tbilisiToday,
} from "@/lib/finance/filters";
import { roundMoney, thresholdStatus } from "@/lib/finance/money";
import { loadSettings } from "@/lib/finance/server/data";
import { financeErrorResponse } from "@/lib/finance/server/http";
import { loadVatWindow } from "@/lib/finance/server/reports";

export const runtime = "nodejs";

// GET /api/admin/finance/summary — the finance dashboard (spec §1, C42).
// Every number is read from one SQL definition: finance_tax_year() for the
// month, the year and the small-business estimate, finance_vat_window() for
// VAT, finance_owner_payables() for third-party money. Wallet usage is
// management information and never part of the cash totals.

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const db = createServiceClient();
  const today = tbilisiToday();
  const year = Number(today.slice(0, 4));
  const thisMonth = monthStart(today);

  try {
    const [
      settings,
      tax,
      vat,
      owners,
      invoices,
      usage,
      reconciliation,
      recent,
    ] = await Promise.all([
      loadSettings(db),
      db.rpc("finance_tax_year", { p_year: year }),
      loadVatWindow(db, today),
      db.rpc("finance_owner_payables"),
      db
        .from("finance_invoices_v")
        .select("remaining, is_overdue")
        .in("status", ["issued", "sent"])
        .gt("remaining", 0),
      db.rpc("finance_wallet_usage", {
        p_from: dayStart(thisMonth),
        p_to: dayEndExclusive(today),
      }),
      db.rpc("finance_wallet_reconciliation"),
      db
        .from("finance_payments_v")
        .select("*")
        .in("status", RECEIVED_PAYMENT_STATUSES)
        .order("occurred_at", { ascending: false })
        .order("id")
        .limit(8),
    ]);
    for (const result of [
      tax,
      owners,
      invoices,
      usage,
      reconciliation,
      recent,
    ]) {
      if (result.error) throw result.error;
    }

    const months = tax.data ?? [];
    const current = months.find((m) => m.month === thisMonth);
    const ytd = (pick: (m: (typeof months)[number]) => number) =>
      roundMoney(
        months
          .filter((m) => m.month <= thisMonth)
          .reduce((sum, m) => sum + pick(m), 0),
      );
    const ytdTaxable = ytd((m) => m.taxable);
    const warn = settings.threshold_warning_percent;
    const payables = owners.data ?? [];
    const open = invoices.data ?? [];

    return Response.json({
      today,
      year,
      month: {
        received: current?.received ?? 0,
        refunds: current?.refunds ?? 0,
        net: current?.net ?? 0,
        ownerShare: current?.owner_share ?? 0,
        taxable: current?.taxable ?? 0,
        estimatedTax: current?.estimated_tax ?? 0,
        rate: current?.rate ?? settings.small_business_rate,
      },
      ytd: {
        received: ytd((m) => m.received),
        refunds: ytd((m) => m.refunds),
        net: ytd((m) => m.net),
        ownerShare: ytd((m) => m.owner_share),
        taxable: ytdTaxable,
        estimatedTax: ytd((m) => m.estimated_tax),
      },
      threshold: {
        amount: ytdTaxable,
        threshold: settings.small_business_threshold,
        warnPercent: warn,
        rate: settings.small_business_rate,
        highRate: settings.small_business_high_rate,
        ...thresholdStatus(ytdTaxable, settings.small_business_threshold, warn),
      },
      vat: {
        windowStart: vat.windowStart,
        windowEnd: vat.windowEnd,
        turnover: vat.turnover,
        threshold: vat.threshold,
        registered: vat.registered,
        rate: vat.rate,
        ...thresholdStatus(vat.turnover, vat.threshold, warn),
      },
      owners: {
        outstanding: roundMoney(
          payables.reduce((sum, o) => sum + Math.max(o.outstanding, 0), 0),
        ),
        count: payables.filter((o) => o.outstanding > 0).length,
      },
      invoices: {
        unpaid: open.length,
        overdue: open.filter((i) => i.is_overdue).length,
        remaining: roundMoney(
          open.reduce((sum, i) => sum + (i.remaining ?? 0), 0),
        ),
      },
      wallet: {
        usage: usage.data ?? [],
        reconciliation: reconciliation.data?.[0] ?? null,
      },
      recent: recent.data ?? [],
      issuerComplete: Boolean(
        settings.legal_name?.trim() && settings.tax_id?.trim(),
      ),
    });
  } catch (error) {
    return financeErrorResponse(error, "summary");
  }
}
