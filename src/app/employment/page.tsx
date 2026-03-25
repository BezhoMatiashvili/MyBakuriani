import { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "დასაქმება ბაკურიანში | MyBakuriani",
  description:
    "სამუშაო ვაკანსიები ბაკურიანში — იპოვეთ სასურველი პოზიცია ბაკურიანის კურორტზე.",
};

const ITEMS_PER_PAGE = 12;

const positionTypes = [
  { value: "", label: "ყველა პოზიცია" },
  { value: "მიმტანი", label: "მიმტანი" },
  { value: "მზარეული", label: "მზარეული" },
  { value: "დამლაგებელი", label: "დამლაგებელი" },
  { value: "ინსტრუქტორი", label: "ინსტრუქტორი" },
  { value: "ადმინისტრატორი", label: "ადმინისტრატორი" },
  { value: "სხვა", label: "სხვა" },
];

export default async function EmploymentPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const positionType = params.position ?? "";
  const minSalary = params.minSalary ? Number(params.minSalary) : null;

  const supabase = await createClient();

  let query = supabase
    .from("services")
    .select("*", { count: "exact" })
    .eq("category", "employment")
    .eq("status", "active")
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE - 1);

  if (positionType) {
    query = query.ilike("position", `%${positionType}%`);
  }
  if (minSalary) {
    query = query.gte("price", minSalary);
  }

  const { data: services, count } = await query;
  const totalPages = Math.ceil((count ?? 0) / ITEMS_PER_PAGE);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-2 text-3xl font-bold text-foreground">
        დასაქმება ბაკურიანში
      </h1>
      <p className="mb-8 text-muted-foreground">
        სამუშაო ვაკანსიები და დასაქმების შესაძლებლობები
      </p>

      {/* Filter bar */}
      <form className="mb-8 flex flex-wrap gap-3">
        <select
          name="position"
          defaultValue={positionType}
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
        >
          {positionTypes.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        <input
          name="minSalary"
          type="number"
          placeholder="მინ. ანაზღაურება ₾"
          defaultValue={minSalary ?? ""}
          className="h-10 w-44 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground"
        />

        <button
          type="submit"
          className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          ფილტრი
        </button>
      </form>

      {/* Job listing cards */}
      {services && services.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {services.map((job) => (
            <Link
              key={job.id}
              href={`/employment/${job.id}`}
              className="block overflow-hidden rounded-[var(--radius-card)] bg-brand-surface shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]"
            >
              <div className="p-5">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <h3 className="text-base font-semibold text-foreground">
                    {job.title}
                  </h3>
                  {job.is_vip && (
                    <span className="shrink-0 rounded-md bg-brand-vip px-2 py-0.5 text-xs font-bold text-white">
                      VIP
                    </span>
                  )}
                </div>

                {job.position && (
                  <Badge variant="secondary" className="mb-3">
                    {job.position}
                  </Badge>
                )}

                {job.salary_range && (
                  <p className="mb-2 text-sm font-bold text-foreground">
                    {job.salary_range}
                  </p>
                )}

                {job.price != null && !job.salary_range && (
                  <p className="mb-2 text-sm font-bold text-foreground">
                    {formatPrice(job.price)}
                    {job.price_unit && (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        / {job.price_unit}
                      </span>
                    )}
                  </p>
                )}

                {job.employment_schedule && (
                  <p className="mb-1 text-xs text-muted-foreground">
                    📅 {job.employment_schedule}
                  </p>
                )}

                {job.experience_required && (
                  <p className="text-xs text-muted-foreground">
                    💼 {job.experience_required}
                  </p>
                )}

                {job.location && (
                  <p className="mt-2 truncate text-xs text-muted-foreground">
                    📍 {job.location}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="py-16 text-center">
          <p className="text-lg text-muted-foreground">
            ვაკანსიები ვერ მოიძებნა
          </p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="mt-10 flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={{
                pathname: "/employment",
                query: { ...params, page: page - 1 },
              }}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
            >
              წინა
            </Link>
          )}

          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={{ pathname: "/employment", query: { ...params, page: p } }}
              className={`rounded-lg px-4 py-2 text-sm ${
                p === page
                  ? "bg-primary text-primary-foreground"
                  : "border border-border hover:bg-muted"
              }`}
            >
              {p}
            </Link>
          ))}

          {page < totalPages && (
            <Link
              href={{
                pathname: "/employment",
                query: { ...params, page: page + 1 },
              }}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
            >
              შემდეგი
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}
