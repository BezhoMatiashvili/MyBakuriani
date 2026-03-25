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
    .select("title, description, position")
    .eq("id", id)
    .single();

  if (!data) return { title: "დასაქმება | MyBakuriani" };

  return {
    title: `${data.title} | დასაქმება | MyBakuriani`,
    description:
      data.description ?? `${data.position ?? "ვაკანსია"} ბაკურიანში`,
  };
}

export default async function EmploymentDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: job } = await supabase
    .from("services")
    .select(
      "*, owner:profiles!services_owner_id_fkey(display_name, phone, avatar_url, rating)",
    )
    .eq("id", id)
    .single();

  if (!job) notFound();

  const owner = job.owner as {
    display_name: string;
    phone: string;
    avatar_url: string | null;
    rating: number | null;
  } | null;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/employment"
        className="mb-6 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        ← დასაქმება
      </Link>

      {/* Photo gallery */}
      {job.photos.length > 0 && (
        <div className="mb-8 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {job.photos.map((photo, i) => (
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
                  alt={`${job.title} - ${i + 1}`}
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
              {job.title}
            </h1>
            {job.position && <Badge variant="secondary">{job.position}</Badge>}
            {job.is_vip && (
              <span className="rounded-md bg-brand-vip px-2 py-0.5 text-xs font-bold text-white">
                VIP
              </span>
            )}
          </div>

          {/* Full job description */}
          {job.description && (
            <div className="mb-6">
              <h2 className="mb-2 text-lg font-semibold text-foreground">
                აღწერა
              </h2>
              <p className="whitespace-pre-line text-muted-foreground">
                {job.description}
              </p>
            </div>
          )}

          {/* Requirements */}
          {job.experience_required && (
            <div className="mb-6">
              <h2 className="mb-2 text-lg font-semibold text-foreground">
                მოთხოვნები
              </h2>
              <p className="text-muted-foreground">
                💼 {job.experience_required}
              </p>
            </div>
          )}

          {/* Salary */}
          <div className="mb-6">
            <h2 className="mb-2 text-lg font-semibold text-foreground">
              ანაზღაურება
            </h2>
            {job.salary_range ? (
              <p className="text-xl font-bold text-foreground">
                {job.salary_range}
              </p>
            ) : job.price != null ? (
              <p className="text-xl font-bold text-foreground">
                {formatPrice(job.price)}
                {job.price_unit && (
                  <span className="ml-1 text-base font-normal text-muted-foreground">
                    / {job.price_unit}
                  </span>
                )}
              </p>
            ) : (
              <p className="text-muted-foreground">შეთანხმებით</p>
            )}
          </div>

          {/* Schedule */}
          {job.employment_schedule && (
            <div className="mb-6">
              <h2 className="mb-2 text-lg font-semibold text-foreground">
                სამუშაო განრიგი
              </h2>
              <p className="text-muted-foreground">
                📅 {job.employment_schedule}
              </p>
            </div>
          )}

          {/* Location */}
          {job.location && (
            <div className="mb-6">
              <h2 className="mb-2 text-lg font-semibold text-foreground">
                მდებარეობა
              </h2>
              <p className="text-muted-foreground">📍 {job.location}</p>
            </div>
          )}
        </div>

        {/* Sidebar — How to apply */}
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

            {(job.phone || owner?.phone) && (
              <a
                href={`tel:${job.phone || owner?.phone}`}
                className="mb-3 flex w-full items-center justify-center rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                📞 {formatPhone(job.phone || owner?.phone || "")}
              </a>
            )}

            <a
              href={`sms:${job.phone || owner?.phone}`}
              className="flex w-full items-center justify-center rounded-lg border border-border px-4 py-3 text-sm font-medium text-foreground hover:bg-muted"
            >
              ✉️ გამოხმაურება
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
