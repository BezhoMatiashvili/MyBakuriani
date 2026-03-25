import { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ServiceCard from "@/components/cards/ServiceCard";

export const metadata: Metadata = {
  title: "კვება & რესტორნები | MyBakuriani",
  description:
    "რესტორნები, კაფეები და საკვების მიტანა ბაკურიანში — ქართული და საერთაშორისო სამზარეულო.",
};

const ITEMS_PER_PAGE = 12;

const cuisineTypes = [
  { value: "", label: "ყველა სამზარეულო" },
  { value: "ქართული", label: "ქართული" },
  { value: "ევროპული", label: "ევროპული" },
  { value: "აზიური", label: "აზიური" },
  { value: "ფასტფუდი", label: "ფასტფუდი" },
  { value: "სხვა", label: "სხვა" },
];

const deliveryOptions = [
  { value: "", label: "მიტანა" },
  { value: "yes", label: "მიტანით" },
  { value: "no", label: "მიტანის გარეშე" },
];

export default async function FoodPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const cuisine = params.cuisine ?? "";
  const delivery = params.delivery ?? "";
  const maxPrice = params.maxPrice ? Number(params.maxPrice) : null;

  const supabase = await createClient();

  let query = supabase
    .from("services")
    .select("*", { count: "exact" })
    .eq("category", "food")
    .eq("status", "active")
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE - 1);

  if (cuisine) {
    query = query.ilike("cuisine_type", `%${cuisine}%`);
  }
  if (delivery === "yes") {
    query = query.eq("has_delivery", true);
  } else if (delivery === "no") {
    query = query.eq("has_delivery", false);
  }
  if (maxPrice) {
    query = query.lte("price", maxPrice);
  }

  const { data: services, count } = await query;
  const totalPages = Math.ceil((count ?? 0) / ITEMS_PER_PAGE);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-2 text-3xl font-bold text-foreground">
        კვება & რესტორნები
      </h1>
      <p className="mb-8 text-muted-foreground">
        რესტორნები, კაფეები და საკვების მიტანის სერვისი ბაკურიანში
      </p>

      {/* Filter bar */}
      <form className="mb-8 flex flex-wrap gap-3">
        <select
          name="cuisine"
          defaultValue={cuisine}
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
        >
          {cuisineTypes.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        <select
          name="delivery"
          defaultValue={delivery}
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
        >
          {deliveryOptions.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        <input
          name="maxPrice"
          type="number"
          placeholder="მაქს. ფასი ₾"
          defaultValue={maxPrice ?? ""}
          className="h-10 w-36 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground"
        />

        <button
          type="submit"
          className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          ფილტრი
        </button>
      </form>

      {/* Results grid */}
      {services && services.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {services.map((service) => (
            <ServiceCard
              key={service.id}
              id={service.id}
              title={service.title}
              category={service.category}
              location={service.location}
              photos={service.photos}
              price={service.price}
              priceUnit={service.price_unit}
              discountPercent={service.discount_percent}
              isVip={service.is_vip}
            />
          ))}
        </div>
      ) : (
        <div className="py-16 text-center">
          <p className="text-lg text-muted-foreground">
            კვების სერვისები ვერ მოიძებნა
          </p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="mt-10 flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={{ pathname: "/food", query: { ...params, page: page - 1 } }}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
            >
              წინა
            </Link>
          )}

          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={{ pathname: "/food", query: { ...params, page: p } }}
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
              href={{ pathname: "/food", query: { ...params, page: page + 1 } }}
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
