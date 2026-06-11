import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations>;

export function formatRelativeTime(
  t: T,
  createdAt: string | null | undefined,
): string {
  if (!createdAt) return "";
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) {
    const mins = Math.floor(diffMs / 60_000);
    return mins < 1 ? t("timeNow") : t("timeMinsAgo", { mins });
  }
  if (hours < 24) return t("timeHoursAgo", { hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t("timeYesterday");
  return t("timeDaysAgo", { days });
}
