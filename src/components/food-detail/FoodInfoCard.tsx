import { Star } from "lucide-react";

interface Props {
  establishmentType: string | null;
  cuisineType: string | null;
  zone: string | null;
  rating: number | null;
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
  rating,
  avgCheck,
  operatingHours,
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-5 rounded-[20px] bg-[#F8FAFC] p-6">
      <Cell label="ტიპი">{establishmentType ?? "—"}</Cell>
      <Cell label="სამზარეული">{cuisineType ?? "—"}</Cell>

      <Cell label="ზონა">{zone ?? "—"}</Cell>
      <Cell label="რეიტინგი">
        {rating != null ? (
          <span className="inline-flex items-center gap-1">
            <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
            {rating.toFixed(1)}
          </span>
        ) : (
          "—"
        )}
      </Cell>

      <Cell label="საშუალო ჩეკი">{avgCheck ?? "—"}</Cell>
      <Cell label="სამუშაო საათები">{operatingHours ?? "—"}</Cell>
    </div>
  );
}
