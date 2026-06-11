import { useTranslations } from "next-intl";

interface Props {
  percent: number;
  label?: string;
  size?: "sm" | "md";
  showPercent?: boolean;
  hint?: string;
}

export default function ConstructionProgressBar({
  percent,
  label,
  size = "md",
  showPercent = true,
  hint,
}: Props) {
  const t = useTranslations("Shared");
  const resolvedLabel = label ?? t("constructionProgress");
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const barHeight = size === "sm" ? "h-1.5" : "h-2";
  const labelSize = size === "sm" ? "text-[11px]" : "text-[12px]";

  return (
    <div className="w-full">
      <div
        className={`mb-1.5 flex items-center justify-between gap-2 ${labelSize}`}
      >
        <span className="truncate font-bold text-[#64748B]">
          {resolvedLabel}
        </span>
        {showPercent && (
          <span className="shrink-0 font-black text-[#16A34A]">{clamped}%</span>
        )}
      </div>
      <div
        className={`${barHeight} w-full overflow-hidden rounded-full bg-[#F1F5F9]`}
      >
        <div
          className="h-full rounded-full bg-[#16A34A] transition-all duration-500"
          style={{ width: `${clamped}%` }}
        />
      </div>
      {hint && (
        <p className="mt-1 text-[11px] font-medium text-[#94A3B8]">{hint}</p>
      )}
    </div>
  );
}
