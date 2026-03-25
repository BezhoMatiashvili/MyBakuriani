import { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ServiceCard from "@/components/cards/ServiceCard";

export const metadata: Metadata = {
  title: "ტრანსპორტი და ტრანსფერები | MyBakuriani",
  description:
    "ტრანსპორტი და ტრანსფერი ბაკურიანში — მძღოლები, მარშრუტები, ავტომობილები.",
};

const ITEMS_PER_PAGE = 12;

export default async function TransportPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const route = params.route ?? "";
  const maxPrice = params.maxPrice ? Number(params.maxPrice) : null;
  const minCapacity = params.capacity ? Number(params.capacity) : null;

  const supabase = await createClient();

  let query = supabase
    .from("services")
    .select("*", { count: "exact" })
    .eq("category", "transport")
    .eq("status", "active")
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE - 1);

  if (route) {
    query = query.ilike("route", `%${route}%`);
  }
  if (maxPrice) {
    query = query.lte("price", maxPrice);
  }
  if (minCapacity) {
    query = query.gte("vehicle_capacity", minCapacity);
  }

  const { data: services, count } = await query;
  const totalPages = Math.ceil((count ?? 0) / ITEMS_PER_PAGE);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-2 text-3xl font-bold text-foreground">
        ტრანსპორტი და ტრანსფერები
      </h1>
      <p className="mb-8 text-muted-foreground">
        მძღოლები, ტრანსფერები და სატრანსპორტო სერვისები ბაკურიანში
      </p>

      {/* Filter bar */}
      <form className="mb-8 flex flex-wrap gap-3">
        <input
          name="route"
          type="text"
          placeholder="მარშრუტი"
          defaultValue={route}
          className="h-10 w-44 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground"
        />

        <input
          name="capacity"
          type="number"
          placeholder="მინ. ადგილები"
          defaultValue={minCapacity ?? ""}
          className="h-10 w-36 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground"
        />

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
            სატრანსპორტო სერვისები ვერ მოიძებნა
          </p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="mt-10 flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={{
                pathname: "/transport",
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
              href={{ pathname: "/transport", query: { ...params, page: p } }}
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
                pathname: "/transport",
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
