import { useTranslations } from "next-intl";

interface Props {
  establishmentType: string | null;
  cuisineType: string | null;
  zone: string | null;
  avgCheck: string | null;
  operatingHours: string | null;
}

function Cell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <span className="mb-1 text-[12px] font-medium text-[#94A3B8]">
        {label}
      </span>
      <span className="text-[14px] font-semibold text-[#1E293B]">
        {children}
      </span>
    </div>
  );
}

export function FoodInfoCard({
  establishmentType,
  cuisineType,
  zone,
  avgCheck,
  operatingHours,
}: Props) {
  const t = useTranslations("FoodDetail");
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-5 rounded-[20px] bg-[#F8FAFC] p-6">
      <Cell label={t("info.type")}>{establishmentType ?? "—"}</Cell>
      <Cell label={t("info.cuisine")}>{cuisineType ?? "—"}</Cell>

      <div className="col-span-2">
        <Cell label={t("info.zone")}>{zone ?? "—"}</Cell>
      </div>

      <Cell label={t("info.avgCheck")}>{avgCheck ?? "—"}</Cell>
      <Cell label={t("info.workingHours")}>{operatingHours ?? "—"}</Cell>
    </div>
  );
}
