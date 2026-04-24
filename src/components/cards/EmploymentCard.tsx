import { Banknote, Calendar, Star } from "lucide-react";

export interface EmploymentCardProps {
  id: string;
  title: string;
  employer?: string | null;
  price: number | null;
  priceUnit?: string | null;
  availability?: string;
  badge?: "popular" | "new" | null;
  postedLabel?: string;
  highlighted?: boolean;
}

export default function EmploymentCard({
  title,
  employer,
  price,
  priceUnit,
  availability,
  badge,
  postedLabel,
  highlighted,
}: EmploymentCardProps) {
  return (
    <div
      className={`relative flex h-full flex-col overflow-hidden rounded-[24px] border p-5 ${
        highlighted
          ? "border-[#F97316] bg-[#FFF7ED]"
          : "border-[#E2E8F0] bg-white"
      }`}
    >
      {highlighted && (
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#FED7AA]/70 blur-2xl" />
      )}

      <div className="relative flex items-start justify-between">
        {badge === "popular" && (
          <span className="inline-flex items-center gap-1 rounded-md bg-[#F97316] px-2 py-1 text-[11px] font-black uppercase text-white">
            <Star className="h-3 w-3 fill-white" />
            პოპულარული
          </span>
        )}
        {badge === "new" && (
          <span className="inline-flex items-center rounded-md bg-[#DBEAFE] px-2 py-1 text-[11px] font-black text-[#1D4ED8]">
            ახალი
          </span>
        )}
        {!badge && <span />}
        {postedLabel && (
          <span className="text-[11px] font-medium text-[#94A3B8]">
            {postedLabel}
          </span>
        )}
      </div>

      <h3 className="relative mt-4 text-[18px] font-black leading-[22px] text-[#1E293B]">
        {title}
      </h3>
      {employer && (
        <p className="relative mt-1 text-[13px] font-medium leading-[18px] text-[#64748B]">
          {employer}
        </p>
      )}

      <div className="relative mt-4 flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#FFF7ED] text-[#F97316]">
          <Banknote className="h-4 w-4" />
        </span>
        <span className="text-[13px] font-bold text-[#1E293B]">
          {price != null ? `${price} ₾` : "—"}
          {priceUnit ? (
            <span className="font-medium text-[#64748B]"> / {priceUnit}</span>
          ) : null}
        </span>
      </div>

      <div className="relative mt-2 flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5">
        <Calendar className="h-4 w-4 text-[#64748B]" />
        <span className="text-[13px] font-medium text-[#64748B]">
          {availability ?? "მოქნილი"}
        </span>
      </div>

      <div className="relative mt-5 flex items-center gap-2">
        <button
          type="button"
          className="flex h-11 flex-1 items-center justify-center rounded-xl bg-[#0F172A] text-[13px] font-bold text-white transition-colors hover:bg-[#1E293B]"
        >
          გამოხმაურება
        </button>
        <button
          type="button"
          className={`flex h-11 flex-1 items-center justify-center rounded-xl border bg-white text-[13px] font-bold transition-colors ${
            highlighted
              ? "border-[#F97316] text-[#F97316] hover:bg-[#FFF7ED]"
              : "border-[#E2E8F0] text-[#1E293B] hover:bg-[#F8FAFC]"
          }`}
        >
          დეტალები
        </button>
      </div>
    </div>
  );
}
