export type SmsFeatureMode = "off" | "qa" | "on";
type WebSmsFeature = "SMS_PRICE_DROP_MODE";

function readMode(name: WebSmsFeature): SmsFeatureMode {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === "off" || raw === "qa" || raw === "on") return raw;
  return process.env.NODE_ENV === "production" ? "off" : "on";
}

function qaUsers(): Set<string> {
  return new Set(
    (process.env.SMS_QA_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function isSmsFeatureEnabled(
  name: WebSmsFeature,
  userId: string | null | undefined,
): boolean {
  const mode = readMode(name);
  if (mode === "on") return true;
  if (mode === "off" || !userId) return false;
  return qaUsers().has(userId);
}

export function smsFeatureMode(name: WebSmsFeature): SmsFeatureMode {
  return readMode(name);
}
