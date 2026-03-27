"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
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

import { SearchBox, type SearchFilters } from "@/components/search/SearchBox";
import { RentBuyToggle } from "@/components/search/RentBuyToggle";
import ScrollReveal from "@/components/shared/ScrollReveal";
import PropertyCard from "@/components/cards/PropertyCard";
import ServiceCard from "@/components/cards/ServiceCard";
import SmartMatchCard from "@/components/cards/SmartMatchCard";
import { Button } from "@/components/ui/button";
import type { Tables } from "@/lib/types/database";

interface LandingPageProps {
  hotOffers?: Tables<"properties">[];
  hotels?: Tables<"properties">[];
  saleProperties?: Tables<"properties">[];
  services?: Tables<"services">[];
  blogPosts?: Tables<"blog_posts">[];
}

// ─── Mock Data ───────────────────────────────────────────────────────────

const MOCK_PROPERTIES = [
  {
    id: "prop-1",
    title: "პრემიუმ აპარტამენტი დიდველთან",
    location: "ბაკურიანი, დიდველი",
    photos: [
      "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&h=600&fit=crop",
    ],
    pricePerNight: 250,
    salePrice: null,
    rating: 4.9,
    capacity: 8,
    rooms: 3,
    isVip: true,
    isSuperVip: true,
    discountPercent: 0,
    isForSale: false,
  },
  {
    id: "prop-2",
    title: "მყუდრო აპარტამენტი ცენტრში",
    location: "ბაკურიანი, ცენტრი",
    photos: [
      "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800&h=600&fit=crop",
    ],
    pricePerNight: 150,
    salePrice: null,
    rating: 4.5,
    capacity: 4,
    rooms: 2,
    isVip: true,
    isSuperVip: false,
    discountPercent: 15,
    isForSale: false,
  },
  {
    id: "prop-3",
    title: "ხის კოტეჯი ტყის პირას",
    location: "ბაკურიანი, წყაროს უბანი",
    photos: [
      "https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?w=800&h=600&fit=crop",
    ],
    pricePerNight: 350,
    salePrice: null,
    rating: 4.8,
    capacity: 10,
    rooms: 4,
    isVip: false,
    isSuperVip: false,
    discountPercent: 0,
    isForSale: false,
  },
  {
    id: "prop-4",
    title: "ლუქს ვილა პანორამული ხედით",
    location: "ბაკურიანი, მთის უბანი",
    photos: [
      "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&h=600&fit=crop",
    ],
    pricePerNight: 500,
    salePrice: null,
    rating: 5.0,
    capacity: 14,
    rooms: 5,
    isVip: true,
    isSuperVip: false,
    discountPercent: 0,
    isForSale: false,
  },
  {
    id: "prop-5",
    title: "სტუდიო ახალ კორპუსში",
    location: "ბაკურიანი, ახალი უბანი",
    photos: [
      "https://images.unsplash.com/photo-1554995207-c18c203602cb?w=800&h=600&fit=crop",
    ],
    pricePerNight: 80,
    salePrice: null,
    rating: 4.2,
    capacity: 2,
    rooms: 1,
    isVip: false,
    isSuperVip: false,
    discountPercent: 10,
    isForSale: false,
  },
  {
    id: "prop-6",
    title: "ოჯახური აპარტამენტი ბუხრით",
    location: "ბაკურიანი, დიდველი",
    photos: [
      "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=800&h=600&fit=crop",
    ],
    pricePerNight: 200,
    salePrice: null,
    rating: 4.6,
    capacity: 6,
    rooms: 3,
    isVip: false,
    isSuperVip: false,
    discountPercent: 0,
    isForSale: false,
  },
  {
    id: "prop-7",
    title: 'კოტეჯი „მთის სიჩუმე"',
    location: "ბაკურიანი, ტაბაწყური",
    photos: [
      "https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=800&h=600&fit=crop",
    ],
    pricePerNight: 280,
    salePrice: null,
    rating: 4.7,
    capacity: 8,
    rooms: 3,
    isVip: false,
    isSuperVip: false,
    discountPercent: 0,
    isForSale: false,
  },
  {
    id: "prop-8",
    title: 'აპარტამენტი „ალპური"',
    location: "ბაკურიანი, ცენტრი",
    photos: [
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&h=600&fit=crop",
    ],
    pricePerNight: 180,
    salePrice: null,
    rating: 4.4,
    capacity: 5,
    rooms: 2,
    isVip: false,
    isSuperVip: false,
    discountPercent: 0,
    isForSale: false,
  },
];

const MOCK_HOTELS = [
  {
    id: "hotel-1",
    title: 'სასტუმრო „კრისტალი"',
    location: "ბაკურიანი, ცენტრი",
    photos: [
      "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&h=600&fit=crop",
    ],
    pricePerNight: 200,
    salePrice: null,
    rating: 4.6,
    capacity: 2,
    rooms: 1,
    isVip: true,
    isSuperVip: false,
    discountPercent: 0,
    isForSale: false,
  },
  {
    id: "hotel-2",
    title: 'სასტუმრო „მთის ხედი"',
    location: "ბაკურიანი, დიდველი",
    photos: [
      "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&h=600&fit=crop",
    ],
    pricePerNight: 280,
    salePrice: null,
    rating: 4.7,
    capacity: 3,
    rooms: 2,
    isVip: false,
    isSuperVip: false,
    discountPercent: 0,
    isForSale: false,
  },
  {
    id: "hotel-3",
    title: 'სასტუმრო „ბაკურიანი პალასი"',
    location: "ბაკურიანი, ცენტრი",
    photos: [
      "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800&h=600&fit=crop",
    ],
    pricePerNight: 350,
    salePrice: null,
    rating: 4.9,
    capacity: 4,
    rooms: 2,
    isVip: true,
    isSuperVip: true,
    discountPercent: 0,
    isForSale: false,
  },
  {
    id: "hotel-4",
    title: 'სასტუმრო „ალპური"',
    location: "ბაკურიანი, წყაროს უბანი",
    photos: [
      "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?w=800&h=600&fit=crop",
    ],
    pricePerNight: 150,
    salePrice: null,
    rating: 4.5,
    capacity: 2,
    rooms: 1,
    isVip: false,
    isSuperVip: false,
    discountPercent: 10,
    isForSale: false,
  },
];

const MOCK_SALE_APARTMENTS = [
  {
    id: "apt-1",
    title: 'აპარტამენტი „მზიური"',
    location: "ბაკურიანი, ახალი უბანი",
    photos: [
      "https://images.unsplash.com/photo-1560185127-6ed189bf02f4?w=800&h=600&fit=crop",
    ],
    pricePerNight: null,
    salePrice: 85000,
    rating: null,
    capacity: 4,
    rooms: 2,
    isVip: true,
    isSuperVip: false,
    discountPercent: 0,
    isForSale: true,
  },
  {
    id: "apt-2",
    title: 'აპარტამენტი „თოვლიანი"',
    location: "ბაკურიანი, დიდველი",
    photos: [
      "https://images.unsplash.com/photo-1502672023488-70e25813eb80?w=800&h=600&fit=crop",
    ],
    pricePerNight: null,
    salePrice: 65000,
    rating: null,
    capacity: 2,
    rooms: 1,
    isVip: false,
    isSuperVip: false,
    discountPercent: 0,
    isForSale: true,
  },
  {
    id: "apt-3",
    title: 'ვილა „მწვანე ველი"',
    location: "ბაკურიანი, ტაბაწყური",
    photos: [
      "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&h=600&fit=crop",
    ],
    pricePerNight: null,
    salePrice: 250000,
    rating: null,
    capacity: 12,
    rooms: 4,
    isVip: true,
    isSuperVip: true,
    discountPercent: 0,
    isForSale: true,
  },
  {
    id: "apt-4",
    title: 'აპარტამენტი „მთის ქარი"',
    location: "ბაკურიანი, ახალი უბანი",
    photos: [
      "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&h=600&fit=crop",
    ],
    pricePerNight: null,
    salePrice: 120000,
    rating: null,
    capacity: 6,
    rooms: 3,
    isVip: false,
    isSuperVip: false,
    discountPercent: 20,
    isForSale: true,
  },
];

function makeServiceCards(category: string, count: number) {
  const data: Record<
    string,
    Array<{
      title: string;
      photo: string;
      price: number;
      unit: string;
      discount: number;
      vip: boolean;
    }>
  > = {
    transport: [
      {
        title: "ტრანსფერი თბილისიდან ბაკურიანში",
        photo:
          "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800&h=600&fit=crop",
        price: 150,
        unit: "მგზავრობა",
        discount: 10,
        vip: true,
      },
      {
        title: "სათხილამურო ტრანსფერი დიდველზე",
        photo:
          "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=800&h=600&fit=crop",
        price: 20,
        unit: "მგზავრობა",
        discount: 0,
        vip: false,
      },
      {
        title: "ჯიპ-ტური მთებში",
        photo:
          "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop",
        price: 200,
        unit: "ტური",
        discount: 0,
        vip: false,
      },
    ],
    handyman: [
      {
        title: "სანტექნიკი — გამოძახებით",
        photo:
          "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=800&h=600&fit=crop",
        price: 50,
        unit: "გამოძახება",
        discount: 0,
        vip: false,
      },
      {
        title: "ელექტრიკი — სწრაფი სერვისი",
        photo:
          "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=800&h=600&fit=crop",
        price: 60,
        unit: "გამოძახება",
        discount: 0,
        vip: true,
      },
      {
        title: "დალაგება და გაწმენდა",
        photo:
          "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800&h=600&fit=crop",
        price: 80,
        unit: "დალაგება",
        discount: 0,
        vip: false,
      },
    ],
    entertainment: [
      {
        title: "თხილამურის გაკვეთილი",
        photo:
          "https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800&h=600&fit=crop",
        price: 80,
        unit: "გაკვეთილი",
        discount: 10,
        vip: true,
      },
      {
        title: "ცხენებით სეირნობა",
        photo:
          "https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?w=800&h=600&fit=crop",
        price: 60,
        unit: "სეირნობა",
        discount: 0,
        vip: false,
      },
      {
        title: 'SPA & საუნა „რელაქსი"',
        photo:
          "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=800&h=600&fit=crop",
        price: 120,
        unit: "ვიზიტი",
        discount: 0,
        vip: false,
      },
    ],
    food: [
      {
        title: 'რესტორანი „მთის გემო"',
        photo:
          "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop",
        price: 25,
        unit: "კერძი",
        discount: 0,
        vip: true,
      },
      {
        title: 'პიცერია „იტალიანო"',
        photo:
          "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&h=600&fit=crop",
        price: 18,
        unit: "კერძი",
        discount: 15,
        vip: false,
      },
      {
        title: 'კაფე-ბარი „თოვლის ბუნკერი"',
        photo:
          "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&h=600&fit=crop",
        price: 12,
        unit: "სასმელი",
        discount: 0,
        vip: false,
      },
    ],
    employment: [
      {
        title: "მზარეული — სასტუმროსთვის",
        photo:
          "https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=800&h=600&fit=crop",
        price: 100,
        unit: "დღე",
        discount: 0,
        vip: true,
      },
      {
        title: "ადმინისტრატორი — რეცეფცია",
        photo:
          "https://images.unsplash.com/photo-1551836022-d5bbed6abbcd?w=800&h=600&fit=crop",
        price: 80,
        unit: "დღე",
        discount: 0,
        vip: false,
      },
      {
        title: "დამლაგებელი — სეზონური",
        photo:
          "https://images.unsplash.com/photo-1585421514738-01798e348b17?w=800&h=600&fit=crop",
        price: 60,
        unit: "დღე",
        discount: 0,
        vip: false,
      },
    ],
  };
  const items = data[category] ?? [];
  return items.slice(0, count).map((item, i) => ({
    id: `${category}-${i + 1}`,
    title: item.title,
    category,
    location: "ბაკურიანი",
    photos: [item.photo],
    price: item.price,
    priceUnit: item.unit,
    discountPercent: item.discount,
    isVip: item.vip,
  }));
}

const MOCK_BLOG_POSTS = [
  {
    id: "1",
    title: "ბაკურიანის სეზონი 2026 — რა სიახლეებია?",
    excerpt:
      "წელს ბაკურიანში მრავალი სიახლე გელოდებათ. ახალი ტრასები, საბაგირო ხაზები და გაუმჯობესებული ინფრასტრუქტურა.",
    image:
      "https://images.unsplash.com/photo-1551524559-8af4e6624178?w=800&h=600&fit=crop",
    date: "2026-03-20",
  },
  {
    id: "2",
    title: "როგორ ავირჩიოთ საუკეთესო აპარტამენტი ბაკურიანში",
    excerpt:
      "გაიგეთ რა კრიტერიუმებით უნდა აირჩიოთ საუკეთესო აპარტამენტი ბაკურიანში თქვენი დასვენებისთვის.",
    image:
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&h=600&fit=crop",
    date: "2026-03-15",
  },
  {
    id: "3",
    title: "დიდველის ახალი ტრასები — სრული გზამკვლევი",
    excerpt:
      "დიდველის სათხილამურო კურორტმა ახალი ტრასები გახსნა — აი რა უნდა იცოდეთ მათ შესახებ.",
    image:
      "https://images.unsplash.com/photo-1605540436563-5bca919ae766?w=800&h=600&fit=crop",
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

export default function LandingPage({
  hotOffers: serverHotOffers,
  hotels: serverHotels,
  saleProperties: serverSaleProperties,
  services: serverServices,
  blogPosts: serverBlogPosts,
}: LandingPageProps = {}) {
  const [mode, setMode] = useState<"rent" | "sale">("rent");
  const carouselRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const handleSearch = useCallback(
    (sf: SearchFilters) => {
      const params = new URLSearchParams();
      if (sf.location) params.set("location", sf.location);
      if (sf.checkIn) params.set("check_in", sf.checkIn);
      if (sf.checkOut) params.set("check_out", sf.checkOut);
      if (sf.guests) params.set("guests", String(sf.guests));
      if (sf.cadastralCode) params.set("cadastral", sf.cadastralCode);
      params.set("mode", mode);
      router.push(`/search?${params.toString()}`);
    },
    [mode, router],
  );

  // Use server data if available, otherwise fall back to mock
  const hasServerData = serverHotOffers && serverHotOffers.length > 0;

  const hotOfferCards = hasServerData
    ? serverHotOffers.map((p) => ({
        id: p.id,
        title: p.title,
        location: p.location,
        photos: p.photos ?? [],
        pricePerNight: p.price_per_night ? Number(p.price_per_night) : null,
        salePrice: p.sale_price ? Number(p.sale_price) : null,
        rating: null as number | null,
        capacity: p.capacity,
        rooms: p.rooms,
        isVip: p.is_vip ?? false,
        isSuperVip: p.is_super_vip ?? false,
        discountPercent: p.discount_percent ?? 0,
        isForSale: p.is_for_sale ?? false,
      }))
    : MOCK_PROPERTIES;

  const hotelCards =
    serverHotels && serverHotels.length > 0
      ? serverHotels.map((p) => ({
          id: p.id,
          title: p.title,
          location: p.location,
          photos: p.photos ?? [],
          pricePerNight: p.price_per_night ? Number(p.price_per_night) : null,
          salePrice: null as number | null,
          rating: null as number | null,
          capacity: p.capacity,
          rooms: p.rooms,
          isVip: p.is_vip ?? false,
          isSuperVip: p.is_super_vip ?? false,
          discountPercent: p.discount_percent ?? 0,
          isForSale: false,
        }))
      : MOCK_HOTELS;

  const saleCards =
    serverSaleProperties && serverSaleProperties.length > 0
      ? serverSaleProperties.map((p) => ({
          id: p.id,
          title: p.title,
          location: p.location,
          photos: p.photos ?? [],
          pricePerNight: null as number | null,
          salePrice: p.sale_price ? Number(p.sale_price) : null,
          rating: null as number | null,
          capacity: p.capacity,
          rooms: p.rooms,
          isVip: p.is_vip ?? false,
          isSuperVip: p.is_super_vip ?? false,
          discountPercent: p.discount_percent ?? 0,
          isForSale: true,
        }))
      : MOCK_SALE_APARTMENTS;

  // Group server services by category
  const servicesByCategory = (category: string) => {
    if (serverServices && serverServices.length > 0) {
      return serverServices
        .filter((s) => s.category === category)
        .slice(0, 4)
        .map((s) => ({
          id: s.id,
          title: s.title,
          category: s.category,
          location: s.location,
          photos: s.photos ?? [],
          price: s.price ? Number(s.price) : null,
          priceUnit: s.price_unit,
          discountPercent: s.discount_percent ?? 0,
          isVip: s.is_vip ?? false,
        }));
    }
    return makeServiceCards(category, 4);
  };

  const blogItems =
    serverBlogPosts && serverBlogPosts.length > 0
      ? serverBlogPosts.map((bp) => ({
          id: bp.id,
          title: bp.title,
          excerpt: bp.excerpt ?? "",
          image: bp.image_url ?? "/placeholder-property.jpg",
          date: bp.published_at ?? bp.created_at,
        }))
      : MOCK_BLOG_POSTS;

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
      <section
        className="relative flex min-h-[470px] items-center justify-center overflow-hidden px-4 py-20"
        style={{
          background:
            "linear-gradient(90deg, #101A33 -4.88%, #0E2150 51.09%, #1E419A 119.49%)",
        }}
      >
        <div className="relative z-10 mx-auto w-full max-w-[1160px] text-center">
          <ScrollReveal>
            <h1 className="text-3xl font-black leading-none tracking-[-1.25px] text-white sm:text-4xl md:text-[50px]">
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
              onSearch={handleSearch}
              className="shadow-[var(--shadow-search)]"
            />
          </div>
        </div>
      </section>

      {/* ═══ 2. Dark Status Cards ═══ */}
      <section
        className="px-4 py-8"
        style={{
          background:
            "linear-gradient(90deg, #101A33 -4.88%, #0E2150 51.09%, #1E419A 119.49%)",
        }}
      >
        <div className="mx-auto flex max-w-[1160px] flex-wrap justify-center gap-4">
          {STATS.map((stat) => (
            <ScrollReveal key={stat.label}>
              <div className="flex h-[94px] min-w-[240px] flex-1 items-center gap-4 rounded-2xl border border-white/5 bg-[#222A3B] px-5 py-5 shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)]">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-accent/20 text-brand-accent">
                  {stat.icon}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold uppercase tracking-[0.55px] text-[#94A3B8]">
                    {stat.label}
                  </span>
                  <span className="text-2xl font-black text-white">
                    {stat.value}
                  </span>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* ═══ 3. Hot Offers Carousel ═══ */}
      <section className="mx-auto w-full max-w-7xl px-4 py-16">
        <ScrollReveal>
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-[26px] font-black leading-[32px] text-[#1E293B]">
              ცხელი შეთავაზებები
            </h2>
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
          {hotOfferCards.map((p) => (
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
            <h2 className="text-[26px] font-black leading-[32px] text-[#1E293B]">
              სტუმრების მოთხოვნები
            </h2>
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
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-brand-accent to-brand-accent-hover p-8 text-white md:p-12">
              <div className="relative z-10 max-w-lg">
                <h3 className="text-2xl font-black md:text-3xl">
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
        cards={servicesByCategory("transport")}
        href="/transport"
      />

      {/* ═══ 7. Services Section ═══ */}
      <ServiceSection
        title="სერვისები და ხელოსნები"
        cards={servicesByCategory("handyman")}
        href="/services"
        muted
      />

      {/* ═══ 8. Entertainment Section ═══ */}
      <ServiceSection
        title="გართობა და აქტივობები"
        cards={servicesByCategory("entertainment")}
        href="/entertainment"
      />

      {/* ═══ 9. Food Section ═══ */}
      <ServiceSection
        title="კვება & რესტორნები"
        cards={servicesByCategory("food")}
        href="/food"
        muted
      />

      {/* ═══ 10. Employment Section ═══ */}
      <ServiceSection
        title="დასაქმება ბაკურიანში"
        cards={servicesByCategory("employment")}
        href="/employment"
      />

      {/* ═══ 11. Apartments Section ═══ */}
      <PropertySection
        title="აპარტამენტები და კოტეჯები"
        properties={hotOfferCards.slice(0, 4)}
        href="/apartments"
        muted
      />

      {/* ═══ 12. Hotels Section ═══ */}
      <PropertySection
        title="სასტუმროები"
        properties={hotelCards}
        href="/hotels"
      />

      {/* ═══ 13. Sales Section ═══ */}
      <PropertySection
        title="გასაყიდი ობიექტები"
        properties={saleCards}
        href="/sales"
        muted
      />

      {/* ═══ 13. Blog Section ═══ */}
      <section className="bg-brand-surface-muted px-4 py-16">
        <div className="mx-auto max-w-7xl">
          <ScrollReveal>
            <div className="mb-8 flex items-center justify-between">
              <h2 className="text-[26px] font-black leading-[32px] text-[#1E293B]">
                ბლოგი და სიახლეები
              </h2>
              <Link
                href="/blog"
                className="flex items-center gap-1 text-[13px] font-bold text-[#0F172A] hover:underline"
              >
                ყველა <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </ScrollReveal>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {blogItems.map((post, i) => (
              <ScrollReveal key={post.id} delay={i * 0.1}>
                <Link
                  href={`/blog/${post.id}`}
                  className="group block overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white transition-shadow hover:shadow-[var(--shadow-card-hover)]"
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
            <h2 className="text-2xl font-black md:text-3xl">
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
            <h2 className="text-[26px] font-black leading-[32px] text-[#1E293B]">
              {title}
            </h2>
            <Link
              href={href}
              className="flex items-center gap-1 text-[13px] font-bold text-[#0F172A] hover:underline"
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
            <h2 className="text-[26px] font-black leading-[32px] text-[#1E293B]">
              {title}
            </h2>
            <Link
              href={href}
              className="flex items-center gap-1 text-[13px] font-bold text-[#0F172A] hover:underline"
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
