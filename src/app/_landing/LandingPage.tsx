"use client";

import { useState, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Home,
  SmileIcon,
  Clock,
  ArrowRight,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { SearchBox } from "@/components/search/SearchBox";
import { RentBuyToggle } from "@/components/search/RentBuyToggle";
import ScrollReveal from "@/components/shared/ScrollReveal";
import PropertyCard from "@/components/cards/PropertyCard";
import ServiceCard from "@/components/cards/ServiceCard";
import SmartMatchCard from "@/components/cards/SmartMatchCard";
import { Button } from "@/components/ui/button";

// ─── Mock Data ───────────────────────────────────────────────────────────

const MOCK_PROPERTIES = Array.from({ length: 8 }, (_, i) => ({
  id: `prop-${i + 1}`,
  title: `პრემიუმ აპარტამენტი #${i + 1}`,
  location: "ბაკურიანი, დიდველი",
  photos: ["/placeholder-property.jpg"],
  pricePerNight: 150 + i * 25,
  salePrice: null,
  rating: 4.5 + (i % 5) * 0.1,
  capacity: 4 + (i % 4),
  rooms: 2 + (i % 3),
  isVip: i < 2,
  isSuperVip: i === 0,
  discountPercent: i === 1 ? 15 : i === 3 ? 10 : 0,
  isForSale: false,
}));

const MOCK_HOTELS = Array.from({ length: 4 }, (_, i) => ({
  id: `hotel-${i + 1}`,
  title: `სასტუმრო "${["კრისტალი", "მთის ხედი", "ბაკურიანი პალასი", "ალპური"][i]}"`,
  location: "ბაკურიანი",
  photos: ["/placeholder-property.jpg"],
  pricePerNight: 200 + i * 50,
  salePrice: null,
  rating: 4.6 + (i % 4) * 0.1,
  capacity: 2 + i,
  rooms: 1 + i,
  isVip: i === 0,
  isSuperVip: false,
  discountPercent: 0,
  isForSale: false,
}));

const MOCK_SALE_APARTMENTS = Array.from({ length: 4 }, (_, i) => ({
  id: `apt-${i + 1}`,
  title: `აპარტამენტი "${["მზიური", "თოვლიანი", "მწვანე", "მთის"][i]}"`,
  location: "ბაკურიანი",
  photos: ["/placeholder-property.jpg"],
  pricePerNight: null,
  salePrice: 85000 + i * 15000,
  rating: null,
  capacity: 4 + i,
  rooms: 2 + (i % 3),
  isVip: i === 0,
  isSuperVip: false,
  discountPercent: 0,
  isForSale: false,
}));

function makeServiceCards(category: string, count: number) {
  const names: Record<string, string[]> = {
    transport: [
      "ტრანსფერი თბილისიდან",
      "თხილამურის ტრანსფერი",
      "ჯიპ-ტური",
      "საავტობუსო ტური",
    ],
    handyman: ["სანტექნიკა", "ელექტრიკი", "დალაგება", "რემონტი"],
    entertainment: [
      "თხილამურის გაკვეთილი",
      "ცხენებით სეირნობა",
      "საბავშვო ზონა",
      "SPA & საუნა",
    ],
    food: ["ქართული სამზარეულო", "პიცერია", "კაფე-ბარი", "მიტანის სერვისი"],
    employment: ["მზარეული", "ადმინისტრატორი", "დამლაგებელი", "მძღოლი"],
  };
  return Array.from({ length: count }, (_, i) => ({
    id: `${category}-${i + 1}`,
    title: names[category]?.[i] ?? `${category} #${i + 1}`,
    category,
    location: "ბაკურიანი",
    photos: ["/placeholder-service.jpg"],
    price: 50 + i * 20,
    priceUnit: category === "employment" ? "დღე" : "სერვისი",
    discountPercent: i === 0 ? 10 : 0,
    isVip: i === 0,
  }));
}

const MOCK_BLOG_POSTS = [
  {
    id: "1",
    title: "ბაკურიანის სეზონი 2026 — რა სიახლეებია?",
    excerpt: "წელს ბაკურიანში მრავალი სიახლე გელოდებათ...",
    image: "/placeholder-property.jpg",
    date: "2026-03-20",
  },
  {
    id: "2",
    title: "როგორ ავირჩიოთ საუკეთესო აპარტამენტი",
    excerpt: "გაიგეთ რა კრიტერიუმებით უნდა აირჩიოთ...",
    image: "/placeholder-property.jpg",
    date: "2026-03-15",
  },
  {
    id: "3",
    title: "დიდველის ახალი ტრასები",
    excerpt: "დიდველის სათხილამურო კურორტმა ახალი ტრასები გახსნა...",
    image: "/placeholder-property.jpg",
    date: "2026-03-10",
  },
];

const STATS = [
  {
    icon: <ShieldCheck className="h-5 w-5" />,
    value: "250+",
    label: "ვერიფიცირებული მესაკუთრე",
  },
  {
    icon: <Home className="h-5 w-5" />,
    value: "1,200+",
    label: "აქტიური განცხადება",
  },
  {
    icon: <SmileIcon className="h-5 w-5" />,
    value: "8,500+",
    label: "კმაყოფილი სტუმარი",
  },
  { icon: <Clock className="h-5 w-5" />, value: "5", label: "წელი ბაზარზე" },
];

// ─── Component ───────────────────────────────────────────────────────────

export default function LandingPage() {
  const [mode, setMode] = useState<"rent" | "sale">("rent");
  const carouselRef = useRef<HTMLDivElement>(null);

  const scrollCarousel = (dir: "left" | "right") => {
    if (!carouselRef.current) return;
    const amount = 320;
    carouselRef.current.scrollBy({
      left: dir === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  return (
    <div className="flex flex-col">
      {/* ═══ 1. Hero Section ═══ */}
      <section className="relative flex min-h-[600px] items-center justify-center overflow-hidden bg-brand-primary px-4 py-20">
        <div className="absolute inset-0 bg-gradient-to-b from-brand-primary/90 to-brand-primary-dark/95" />
        <div className="relative z-10 mx-auto max-w-4xl text-center">
          <ScrollReveal>
            <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl md:text-5xl lg:text-6xl">
              ყველაზე სანდო გზამკვლევი ბაკურიანში
            </h1>
            <p className="mt-4 text-base text-white/80 sm:text-lg">
              მხოლოდ ვერიფიცირებული და სანდო მესაკუთრეები
            </p>
          </ScrollReveal>

          <div className="mt-6 flex justify-center">
            <RentBuyToggle value={mode} onChange={setMode} />
          </div>

          <div className="mt-6">
            <SearchBox
              onSearch={() => {}}
              className="shadow-[var(--shadow-search)]"
            />
          </div>
        </div>
      </section>

      {/* ═══ 2. Stats Row ═══ */}
      <section className="bg-brand-primary-dark px-4 py-8">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-4 md:grid-cols-4">
          {STATS.map((stat) => (
            <ScrollReveal key={stat.label}>
              <div className="flex flex-col items-center gap-2 text-center text-white">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-accent/20 text-brand-accent">
                  {stat.icon}
                </div>
                <span className="text-2xl font-bold">{stat.value}</span>
                <span className="text-xs text-white/70">{stat.label}</span>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* ═══ 3. Hot Offers Carousel ═══ */}
      <section className="mx-auto w-full max-w-7xl px-4 py-16">
        <ScrollReveal>
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold">ცხელი შეთავაზებები</h2>
            <div className="flex gap-2">
              <button
                onClick={() => scrollCarousel("left")}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border transition-colors hover:bg-muted"
                aria-label="წინა"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => scrollCarousel("right")}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border transition-colors hover:bg-muted"
                aria-label="შემდეგი"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </ScrollReveal>

        <div
          ref={carouselRef}
          className="scrollbar-hide flex gap-4 overflow-x-auto scroll-smooth pb-4"
        >
          {MOCK_PROPERTIES.map((p) => (
            <div key={p.id} className="w-[280px] shrink-0">
              <PropertyCard {...p} />
            </div>
          ))}
        </div>
      </section>

      {/* ═══ 4. Smart Match Section ═══ */}
      <section className="bg-brand-surface-muted px-4 py-16">
        <div className="mx-auto max-w-7xl">
          <ScrollReveal>
            <h2 className="text-2xl font-bold">სტუმრების მოთხოვნები</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              ნახე რას ეძებენ ახლა
            </p>
          </ScrollReveal>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[5, 3, 8].map((count, i) => (
              <ScrollReveal key={i} delay={i * 0.1}>
                <SmartMatchCard notificationCount={count} onClick={() => {}} />
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 5. Advertising Banner ═══ */}
      <section className="px-4 py-8">
        <div className="mx-auto max-w-7xl">
          <ScrollReveal>
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-accent to-blue-700 p-8 text-white md:p-12">
              <div className="relative z-10 max-w-lg">
                <h3 className="text-2xl font-bold md:text-3xl">
                  დიდველი სათხილამურო კურორტი
                </h3>
                <p className="mt-2 text-sm text-white/80">
                  საუკეთესო ტრასები და თანამედროვე ინფრასტრუქტურა
                </p>
                <Button
                  variant="secondary"
                  className="mt-4 bg-white text-brand-accent hover:bg-white/90"
                >
                  გაიგე მეტი
                </Button>
              </div>
              <div className="absolute -right-10 -bottom-10 h-48 w-48 rounded-full bg-white/10 md:h-64 md:w-64" />
              <div className="absolute -top-8 right-20 h-32 w-32 rounded-full bg-white/5" />
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ═══ 6. Transport Section ═══ */}
      <ServiceSection
        title="ტრანსპორტი და ტრანსფერები"
        cards={makeServiceCards("transport", 4)}
        href="/transport"
      />

      {/* ═══ 7. Services Section ═══ */}
      <ServiceSection
        title="სერვისები და ხელოსნები"
        cards={makeServiceCards("handyman", 4)}
        href="/services"
        muted
      />

      {/* ═══ 8. Entertainment Section ═══ */}
      <ServiceSection
        title="გართობა და აქტივობები"
        cards={makeServiceCards("entertainment", 4)}
        href="/entertainment"
      />

      {/* ═══ 9. Food Section ═══ */}
      <ServiceSection
        title="კვება & რესტორნები"
        cards={makeServiceCards("food", 4)}
        href="/food"
        muted
      />

      {/* ═══ 10. Employment Section ═══ */}
      <ServiceSection
        title="დასაქმება ბაკურიანში"
        cards={makeServiceCards("employment", 4)}
        href="/employment"
      />

      {/* ═══ 11. Hotels Section ═══ */}
      <PropertySection
        title="სასტუმროები"
        properties={MOCK_HOTELS}
        href="/hotels"
        muted
      />

      {/* ═══ 12. Apartments Section ═══ */}
      <PropertySection
        title="აპარტამენტები და კოტეჯები"
        properties={MOCK_SALE_APARTMENTS}
        href="/apartments"
      />

      {/* ═══ 13. Blog Section ═══ */}
      <section className="bg-brand-surface-muted px-4 py-16">
        <div className="mx-auto max-w-7xl">
          <ScrollReveal>
            <div className="mb-8 flex items-center justify-between">
              <h2 className="text-2xl font-bold">ბლოგი და სიახლეები</h2>
              <Link
                href="/blog"
                className="flex items-center gap-1 text-sm font-medium text-brand-accent hover:underline"
              >
                ყველა <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </ScrollReveal>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {MOCK_BLOG_POSTS.map((post, i) => (
              <ScrollReveal key={post.id} delay={i * 0.1}>
                <Link
                  href={`/blog/${post.id}`}
                  className="group block overflow-hidden rounded-[var(--radius-card)] bg-white shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]"
                >
                  <div className="relative aspect-[16/9] overflow-hidden">
                    <Image
                      src={post.image}
                      alt={post.title}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                  <div className="p-4">
                    <time className="text-xs text-muted-foreground">
                      {post.date}
                    </time>
                    <h3 className="mt-1 text-sm font-semibold leading-snug">
                      {post.title}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {post.excerpt}
                    </p>
                  </div>
                </Link>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 14. CTA before footer ═══ */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <ScrollReveal>
            <h2 className="text-2xl font-bold md:text-3xl">
              გქონდეთ ობიექტი ბაკურიანში?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              დაამატეთ თქვენი განცხადება და მიიღეთ შეკვეთები დღესვე
            </p>
            <Link
              href="/create"
              className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-brand-accent px-8 text-sm font-medium text-white transition-colors hover:bg-brand-accent-hover"
            >
              განცხადების დამატება
            </Link>
          </ScrollReveal>
        </div>
      </section>
    </div>
  );
}

// ─── Reusable Section Components ─────────────────────────────────────────

function ServiceSection({
  title,
  cards,
  href,
  muted,
}: {
  title: string;
  cards: Array<{
    id: string;
    title: string;
    category: string;
    location: string | null;
    photos: string[];
    price: number | null;
    priceUnit: string | null;
    discountPercent: number;
    isVip: boolean;
  }>;
  href: string;
  muted?: boolean;
}) {
  return (
    <section className={`px-4 py-16 ${muted ? "bg-brand-surface-muted" : ""}`}>
      <div className="mx-auto max-w-7xl">
        <ScrollReveal>
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold">{title}</h2>
            <Link
              href={href}
              className="flex items-center gap-1 text-sm font-medium text-brand-accent hover:underline"
            >
              ყველა <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </ScrollReveal>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card, i) => (
            <ScrollReveal key={card.id} delay={i * 0.08}>
              <ServiceCard {...card} />
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function PropertySection({
  title,
  properties,
  href,
  muted,
}: {
  title: string;
  properties: Array<{
    id: string;
    title: string;
    location: string;
    photos: string[];
    pricePerNight: number | null;
    salePrice: number | null;
    rating: number | null;
    capacity: number | null;
    rooms: number | null;
    isVip: boolean;
    isSuperVip: boolean;
    discountPercent: number;
    isForSale: boolean;
  }>;
  href: string;
  muted?: boolean;
}) {
  return (
    <section className={`px-4 py-16 ${muted ? "bg-brand-surface-muted" : ""}`}>
      <div className="mx-auto max-w-7xl">
        <ScrollReveal>
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold">{title}</h2>
            <Link
              href={href}
              className="flex items-center gap-1 text-sm font-medium text-brand-accent hover:underline"
            >
              ყველა <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </ScrollReveal>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {properties.map((prop, i) => (
            <ScrollReveal key={prop.id} delay={i * 0.08}>
              <PropertyCard {...prop} />
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
