import { getNbgUsdRate } from "@/lib/currency/nbg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The visitor's price conversion (C55) reads only this: the National Bank of
// Georgia's official USD rate for today, already checked. The edge shares one
// answer for ten minutes; the server itself asks NBG at most once an hour.
export async function GET() {
  const rate = await getNbgUsdRate();
  if (!rate) {
    return Response.json(
      { error: "rate_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(rate, {
    headers: {
      "Cache-Control": "public, s-maxage=600, stale-while-revalidate=600",
    },
  });
}
