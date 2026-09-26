// uBill.ge SMS API helpers shared by sms-dispatch and sms-delivery-report (C18).

export const UBILL_SMS_API = "https://api.ubill.dev/v1/sms";
export const UBILL_TIMEOUT_MS = 10_000;

// Asks uBill for one message's delivery status, using our own API key.
// Returns the report statusID (0 sent, 1 received, 2 not delivered,
// 3 awaiting, 4 error) or null when uBill gave no usable answer.
export async function fetchUbillReportStatus(
  key: string,
  smsId: string,
): Promise<number | null> {
  try {
    const res = await fetch(
      `${UBILL_SMS_API}/report/${encodeURIComponent(smsId)}`,
      { headers: { key }, signal: AbortSignal.timeout(UBILL_TIMEOUT_MS) },
    );
    const report = (await res.json().catch(() => null)) as {
      statusID?: number;
      result?: { statusID?: string | number }[];
    } | null;
    if (Number(report?.statusID) !== 0) return null;
    const status = Number(report?.result?.[0]?.statusID);
    return Number.isInteger(status) ? status : null;
  } catch {
    return null;
  }
}
