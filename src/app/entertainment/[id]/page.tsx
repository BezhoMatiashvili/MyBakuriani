import { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatPrice, formatPhone } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("services")
    .select("title, description")
    .eq("id", id)
    .single();

  if (!data) return { title: "გართობა | MyBakuriani" };

  return {
    title: `${data.title} | გართობა | MyBakuriani`,
    description: data.description ?? "გართობა და აქტივობები ბაკურიანში",
  };
}

export default async function EntertainmentDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: service } = await supabase
    .from("services")
    .select(
      "*, owner:profiles!services_owner_id_fkey(display_name, phone, avatar_url, rating)",
    )
    .eq("id", id)
    .single();

  if (!service) notFound();

  const owner = service.owner as {
    display_name: string;
    phone: string;
    avatar_url: string | null;
    rating: number | null;
  } | null;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/entertainment"
        className="mb-6 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        ← გართობა
      </Link>

      {/* Photo gallery */}
      {service.photos.length > 0 && (
        <div className="mb-8 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {service.photos.map((photo, i) => (
            <div
              key={i}
              className={`relative overflow-hidden rounded-xl ${
                i === 0 ? "sm:col-span-2 sm:row-span-2" : ""
              }`}
            >
              <div
                className={`relative ${i === 0 ? "aspect-[16/10]" : "aspect-[4/3]"}`}
              >
                <Image
                  src={photo}
                  alt={`${service.title} - ${i + 1}`}
                  fill
                  sizes={i === 0 ? "66vw" : "33vw"}
                  className="object-cover"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
              {service.title}
            </h1>
            <Badge variant="secondary">გართობა</Badge>
            {service.is_vip && (
              <span className="rounded-md bg-brand-vip px-2 py-0.5 text-xs font-bold text-white">
                VIP
              </span>
            )}
          </div>

          {service.description && (
            <div className="mb-6">
              <h2 className="mb-2 text-lg font-semibold text-foreground">
                აღწერა
              </h2>
              <p className="whitespace-pre-line text-muted-foreground">
                {service.description}
              </p>
            </div>
          )}

          {/* Schedule */}
          {service.schedule && (
            <div className="mb-6">
              <h2 className="mb-2 text-lg font-semibold text-foreground">
                განრიგი
              </h2>
              <p className="text-muted-foreground">{service.schedule}</p>
            </div>
          )}

          {/* Pricing */}
          {service.price != null && (
            <div className="mb-6">
              <h2 className="mb-2 text-lg font-semibold text-foreground">
                ფასი
              </h2>
              <p className="text-xl font-bold text-foreground">
                {formatPrice(service.price)}
                {service.price_unit && (
                  <span className="ml-1 text-base font-normal text-muted-foreground">
                    / {service.price_unit}
                  </span>
                )}
              </p>
              {service.discount_percent > 0 && (
                <Badge variant="destructive" className="mt-2">
                  -{service.discount_percent}% ფასდაკლება
                </Badge>
              )}
            </div>
          )}

          {/* Location */}
          {service.location && (
            <div className="mb-6">
              <h2 className="mb-2 text-lg font-semibold text-foreground">
                მდებარეობა
              </h2>
              <p className="text-muted-foreground">📍 {service.location}</p>
            </div>
          )}
        </div>

        {/* Sidebar — Contact CTA */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 rounded-xl border border-border bg-brand-surface p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-foreground">
              დაკავშირება
            </h3>

            {owner && (
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-bold">
                  {owner.display_name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {owner.display_name}
                  </p>
                  {owner.rating && (
                    <p className="text-xs text-muted-foreground">
                      ⭐ {owner.rating.toFixed(1)}
                    </p>
                  )}
                </div>
              </div>
            )}

            {(service.phone || owner?.phone) && (
              <a
                href={`tel:${service.phone || owner?.phone}`}
                className="mb-3 flex w-full items-center justify-center rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                📞 {formatPhone(service.phone || owner?.phone || "")}
              </a>
            )}

            <a
              href={`sms:${service.phone || owner?.phone}`}
              className="flex w-full items-center justify-center rounded-lg border border-border px-4 py-3 text-sm font-medium text-foreground hover:bg-muted"
            >
              ✉️ შეტყობინების გაგზავნა
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
