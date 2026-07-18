import { BadgeCheck, Banknote, Heart, MapPin, Star, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useFavorite } from "@/lib/hooks/useFavorite";

export interface EmploymentCardProps {
  id: string;
  title: string;
  employer?: string | null;
  location?: string | null;
  salaryLabel?: string | null;
  scheduleLabel?: string | null;
  description?: string | null;
  applicationsCount?: number;
  badge?: "urgent" | "vip" | "new" | null;
  postedLabel?: string;
  highlighted?: boolean;
}

export default function EmploymentCard({
  id,
  title,
  employer,
  location,
  salaryLabel,
  scheduleLabel,
  description,
  applicationsCount,
  badge,
  postedLabel,
  highlighted,
}: EmploymentCardProps) {
  const t = useTranslations("EmploymentCard");
  const {
    isFavorited,
    busy: favoriteBusy,
    toggle: toggleFavorite,
  } = useFavorite({ serviceId: id });
  return (
    <div
      className={`relative flex h-full flex-col overflow-hidden rounded-[24px] border bg-white p-5 transition-shadow hover:shadow-[var(--shadow-card-hover)] ${
        highlighted
          ? "border-[#F97316] shadow-[0px_4px_20px_-2px_rgba(249,115,22,0.15)]"
          : "border-[#E2E8F0] shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.05)]"
      }`}
    >
      <button
        type="button"
        onClick={toggleFavorite}
        disabled={favoriteBusy}
        aria-pressed={isFavorited}
        aria-label={t("favoriteAria")}
        className={`absolute top-5 right-5 flex h-11 w-11 items-center justify-center rounded-full shadow-[0px_1px_2px_rgba(0,0,0,0.05)] transition-colors disabled:opacity-60 ${
          isFavorited
            ? "bg-[#F97316] text-white"
            : "border border-[#E2E8F0] bg-white text-[#F97316] hover:bg-[#F97316] hover:text-white"
        }`}
      >
        <Heart className={`h-5 w-5 ${isFavorited ? "fill-current" : ""}`} />
      </button>

      <div className="flex items-start justify-between gap-2 pr-14">
        <div className="flex flex-wrap gap-1.5">
          {badge === "urgent" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-[#DCFCE7] px-2 py-1 text-[11px] font-bold text-[#166534]">
              <span className="inline-block size-1.5 rounded-full bg-[#16A34A]" />
              {t("urgent")}
            </span>
          )}
          {badge === "vip" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-[#FEF3C7] px-2 py-1 text-[11px] font-bold text-[#92400E]">
              <Star className="h-3 w-3 fill-[#F59E0B] text-[#F59E0B]" />
              VIP
            </span>
          )}
          {badge === "new" && (
            <span className="inline-flex items-center rounded-md bg-[#DBEAFE] px-2 py-1 text-[11px] font-bold text-[#1D4ED8]">
              {t("new")}
            </span>
          )}
        </div>
        {postedLabel && (
          <span className="shrink-0 text-[11px] font-medium text-[#94A3B8]">
            {postedLabel}
          </span>
        )}
      </div>

      <h3 className="mt-4 text-[18px] font-black leading-[22px] text-[#1E293B] line-clamp-2">
        {title}
      </h3>
      {employer && (
        <p className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-bold leading-[18px] text-[#2563EB]">
          <span className="line-clamp-1">{employer}</span>
          <BadgeCheck className="h-3.5 w-3.5 shrink-0 fill-[#22C55E] text-white" />
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {location && (
          <span className="inline-flex items-center gap-1 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1.5 text-[12px] font-medium text-[#475569]">
            <MapPin className="h-3.5 w-3.5 text-[#64748B]" />
            {location}
          </span>
        )}
        {salaryLabel && (
          <span className="inline-flex items-center gap-1 rounded-md border border-[#BBF7D0] bg-[#F0FDF4] px-2.5 py-1.5 text-[12px] font-bold text-[#166534]">
            <Banknote className="h-3.5 w-3.5" />
            {salaryLabel}
          </span>
        )}
      </div>

      {scheduleLabel && (
        <div className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-[#64748B]">
          <Users className="h-3.5 w-3.5" />
          <span>{scheduleLabel}</span>
        </div>
      )}

      {description && (
        <p className="mt-3 text-[13px] leading-[19px] text-[#64748B] line-clamp-3">
          {description}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
        {applicationsCount != null ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#64748B]">
            <Users className="h-3.5 w-3.5 text-[#22C55E]" />
            {t("applications", { count: applicationsCount })}
          </span>
        ) : (
          <span />
        )}
        <Link
          href={`/employment/${id}`}
          className="flex h-10 items-center justify-center rounded-xl bg-[#0F172A] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#1E293B]"
        >
          {t("details")}
        </Link>
      </div>
    </div>
  );
}
