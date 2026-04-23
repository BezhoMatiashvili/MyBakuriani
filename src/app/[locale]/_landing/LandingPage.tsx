"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, Car, Video } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";

import {
  SearchBox,
  type SearchFilters,
  type ActiveDropdown,
} from "@/components/search/SearchBox";
import { RentBuyToggle } from "@/components/search/RentBuyToggle";
import type { MapProperty } from "@/components/maps/BakurianiMap";
import SaleLandingBody from "./SaleLandingBody";
import { useHomeListingMode } from "@/components/layout/HomeListingModeContext";

const BakurianiMap = dynamic(() => import("@/components/maps/BakurianiMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#F8FAFC]">
      <div className="size-6 animate-spin rounded-full border-2 border-[#CBD5E1] border-t-[#2563EB]" />
    </div>
  ),
});
import ScrollReveal from "@/components/shared/ScrollReveal";
import PropertyCard from "@/components/cards/PropertyCard";
import ServiceCard from "@/components/cards/ServiceCard";
import SmartMatchCard from "@/components/cards/SmartMatchCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
    discountPercent: 20,
    isForSale: false,
    isHotel: true,
    hotelStars: 4,
    numericRating: 9.2,
    isB2BPartner: true,
    roomType: "სტანდარტული ოთახი",
    amenities: "ცენტრი • აუზი / Ski-in/Ski-out",
  },
  {
    id: "hotel-2",
    title: 'სასტუმრო „მთის ხედი"',
    location: "ბაკურიანი, დიდველი",
    photos: [
      "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&h=600&fit=crop",
    ],
    pricePerNight: 450,
    salePrice: null,
    rating: 4.7,
    capacity: 3,
    rooms: 2,
    isVip: false,
    isSuperVip: false,
    discountPercent: 25,
    isForSale: false,
    isHotel: true,
    hotelStars: 5,
    numericRating: 9.5,
    isB2BPartner: false,
    roomType: "KING ROOM",
    amenities: "პრემიუმ ლოკაცია • ტერასა • რესტორანი",
  },
  {
    id: "hotel-3",
    title: 'სასტუმრო „ბაკურიანი პალასი"',
    location: "ბაკურიანი, ცენტრი",
    photos: [
      "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800&h=600&fit=crop",
    ],
    pricePerNight: 280,
    salePrice: null,
    rating: 4.9,
    capacity: 4,
    rooms: 2,
    isVip: true,
    isSuperVip: true,
    discountPercent: 25,
    isForSale: false,
    isHotel: true,
    hotelStars: 4,
    numericRating: 8.9,
    isB2BPartner: true,
    roomType: "ორადგილიანი ოთახი",
    amenities: "ცენტრალური პარკი • სათამაშო ზონა • ბარი",
  },
  {
    id: "hotel-4",
    title: 'სასტუმრო „ალპური"',
    location: "ბაკურიანი, წყაროს უბანი",
    photos: [
      "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?w=800&h=600&fit=crop",
    ],
    pricePerNight: 380,
    salePrice: null,
    rating: 4.5,
    capacity: 2,
    rooms: 1,
    isVip: false,
    isSuperVip: false,
    discountPercent: 0,
    isForSale: false,
    isHotel: true,
    hotelStars: 4,
    numericRating: 9.1,
    isB2BPartner: false,
    roomType: "საოჯახო ნომერი",
    amenities: "კოხტა • ტყე • მთის ხედი",
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
          "https://images.unsplash.com/photo-1539635278303-d4002c07eae3?w=800&h=600&fit=crop",
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

const STATUS_CARDS = [
  { label: "ამინდი", value: "-4°C", fontSize: "text-[24px]" },
  {
    label: "საბაგიროები",
    value: "3/5 ღიაა",
    fontSize: "text-[20px]",
    iconType: "ski" as const,
  },
  {
    label: "გზა თბილისიდან",
    value: "თავისუფალი",
    fontSize: "text-[18px]",
    iconType: "car" as const,
  },
  {
    label: "კამერები",
    value: "2 ლოკაცია",
    fontSize: "text-[18px]",
    iconType: "camera" as const,
    hasRedDot: true,
  },
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
  const [activeDropdown, setActiveDropdown] = useState<ActiveDropdown>(null);
  const dropdownPortalRef = useRef<HTMLDivElement>(null);
  const dropdownBoundaryRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { setListingMode } = useHomeListingMode();

  useEffect(() => {
    setListingMode(mode);
  }, [mode, setListingMode]);

  const mapProperties = useMemo<MapProperty[]>(() => {
    const seen = new Set<string>();
    const all = [...(serverHotOffers ?? []), ...(serverHotels ?? [])];
    return all
      .filter((p) => {
        if (!p.location_lat || !p.location_lng || seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      })
      .map((p) => ({
        id: p.id,
        title: p.title,
        price: p.is_for_sale ? Number(p.sale_price) : Number(p.price_per_night),
        lat: Number(p.location_lat),
        lng: Number(p.location_lng),
        isVip: p.is_vip ?? false,
        isSuperVip: p.is_super_vip ?? false,
        photo: Array.isArray(p.photos) ? (p.photos[0] as string) : undefined,
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverHotOffers, serverHotels]);

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
          isHotel: true as const,
          hotelStars: 4,
          numericRating: 9.4,
          isB2BPartner: p.is_vip ?? false,
          roomType: "სტანდარტული ოთახი",
          amenities: p.location,
        }))
      : MOCK_HOTELS;

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
          date: (() => {
            const d = new Date(
              bp.published_at ?? bp.created_at ?? new Date().toISOString(),
            );
            const months = [
              "იანვარი",
              "თებერვალი",
              "მარტი",
              "აპრილი",
              "მაისი",
              "ივნისი",
              "ივლისი",
              "აგვისტო",
              "სექტემბერი",
              "ოქტომბერი",
              "ნოემბერი",
              "დეკემბერი",
            ];
            return `${d.getUTCDate()} ${months[d.getUTCMonth()]}, ${d.getUTCFullYear()}`;
          })(),
        }))
      : MOCK_BLOG_POSTS;

  if (mode === "sale") {
    return (
      <SaleLandingBody
        mode={mode}
        onModeChange={setMode}
        saleProperties={serverSaleProperties}
      />
    );
  }

  return (
    <div className="flex flex-col">
      {/* ═══ 1. Hero Section ═══ */}
      <section
        className={cn(
          "relative flex min-h-[470px] items-start justify-center px-4 pb-20 pt-16 sm:min-h-0 sm:overflow-visible sm:pb-0",
          activeDropdown ? "overflow-visible" : "overflow-hidden",
        )}
        style={{
          background:
            "linear-gradient(90deg, #101A33 -4.88%, #0E2150 51.09%, #1E419A 119.49%)",
        }}
      >
        {/* Subtle texture overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1483728642387-6c3bdd6c93e5?w=1600&h=600&fit=crop&q=30')",
            backgroundSize: "cover",
            backgroundPosition: "center bottom",
            mixBlendMode: "overlay",
          }}
        />
        <div className="relative z-10 mx-auto w-full max-w-[1160px] text-center">
          <ScrollReveal>
            <h1 className="text-2xl font-black leading-[1] tracking-[-1.25px] text-white sm:text-4xl md:text-[50px] md:leading-[50px]">
              ყველაზე სანდო გზამკვლევი{" "}
              <span className="text-[#38BDF8]">ბაკურიანში</span>
            </h1>
          </ScrollReveal>

          <div className="mt-6 flex justify-center">
            <RentBuyToggle value={mode} onChange={setMode} />
          </div>

          <div className="mt-6">
            <SearchBox
              onSearch={handleSearch}
              className="shadow-[var(--shadow-search)]"
              dropdownPortalRef={dropdownPortalRef}
              dropdownBoundaryRef={dropdownBoundaryRef}
              onActiveDropdownChange={setActiveDropdown}
            />
          </div>

          {/* Status Cards + Dropdown Panel Area */}
          {activeDropdown === "filters" ? (
            /* Filters: portal + map */
            <div
              ref={dropdownBoundaryRef}
              className="mt-8 hidden overflow-hidden rounded-3xl border border-[#E2E8F0] shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)] md:flex"
            >
              <div ref={dropdownPortalRef} className="min-w-0 flex-1" />
              <BakurianiMap
                className="min-h-[400px] w-[280px] shrink-0 self-stretch"
                embedded
                expandable
                properties={mapProperties}
                onPropertyClick={(id) => router.push(`/apartments/${id}`)}
              />
            </div>
          ) : activeDropdown === "calendar" ? (
            /* Calendar: portal + camera card + coupon + discount toggle */
            <div className="mt-8 hidden grid-cols-[1fr_auto] gap-4 md:grid">
              <div ref={dropdownPortalRef} className="min-w-0" />
              <div className="flex w-[240px] flex-col gap-3">
                {/* Camera card */}
                <div className="flex items-center rounded-[16px] border border-white/5 bg-[#222A3B] px-5 py-5 shadow-[var(--shadow-dark-card)]">
                  <div className="flex flex-col gap-1">
                    <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.55px] text-[#94A3B8]">
                      <span className="size-2 rounded-full bg-[#EF4444]" />
                      კამერები
                    </span>
                    <span className="flex items-center gap-2 text-[18px] font-black leading-[28px] text-white">
                      2 ლოკაცია
                      <Video className="size-[18px] text-[#CBD5E1]" />
                    </span>
                  </div>
                </div>
                {/* Coupon button */}
                <button
                  type="button"
                  className="flex h-[52px] items-center justify-center rounded-[16px] border-2 border-[#E8612D] bg-[#FFF7ED] text-[14px] font-bold text-[#E8612D] transition-colors hover:bg-[#FFEDD5]"
                >
                  კუპონის აღება
                </button>
                {/* Discount toggle */}
                <div className="flex items-center justify-between rounded-[16px] border border-[#FFEDD5] bg-[#FFF7ED] px-4 py-3">
                  <span className="flex items-center gap-1.5 text-[12px] font-bold text-[#F97316]">
                    <span className="text-[12px]">{"\uD83D\uDD25"}</span>
                    მხოლოდ ფასდაკლებები
                  </span>
                  <div className="relative inline-flex h-[20px] w-[40px] cursor-pointer items-center rounded-full bg-[#F97316]">
                    <span className="absolute right-0.5 size-[16px] rounded-full bg-white shadow-sm" />
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Status cards row — visible when collapsed OR when location dropdown is open
              (location dropdown floats from SearchBox as overlay) */}
          <div
            className={cn(
              "mt-8 grid grid-cols-2 gap-4 sm:-mb-[42px] sm:grid-cols-4",
              activeDropdown && activeDropdown !== "location"
                ? "md:hidden"
                : "",
            )}
          >
            {STATUS_CARDS.map((card) => (
              <div
                key={card.label}
                className="flex items-center rounded-[16px] border border-white/5 bg-[#222A3B] px-5 py-5 shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)]"
              >
                <div className="flex flex-col gap-1">
                  <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.55px] text-[#94A3B8]">
                    {card.hasRedDot && (
                      <span className="size-2 rounded-full bg-[#EF4444]" />
                    )}
                    {card.label}
                  </span>
                  <span
                    className={`flex items-center gap-2 ${card.fontSize} font-black leading-[28px] text-white`}
                  >
                    {card.value}
                    {card.iconType === "car" && (
                      <Car className="size-[18px] text-[#CBD5E1]" />
                    )}
                    {card.iconType === "camera" && (
                      <Video className="size-[18px] text-[#CBD5E1]" />
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 2.5 Verified-listings info banner ═══ */}
      <div className="mx-auto mt-[70px] w-full max-w-[1160px] px-4 sm:mt-[84px]">
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-[#FFEDD5] bg-[#FFF7ED] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#F97316] text-[13px] font-black text-white"
            >
              i
            </span>
            <p className="text-[13px] font-medium leading-[20px] text-[#9A3412]">
              <span className="font-bold text-[#7C2D12]">
                გადამოწმებულ განცხადებებს ენიჭება ოქროს ფერი
              </span>{" "}
              — აირჩიეთ სანდო მესაკუთრეები უსაფრთხო ჯავშნისთვის.
            </p>
          </div>
          <Link
            href="/faq"
            className="shrink-0 rounded-full border border-[#FFEDD5] bg-white px-4 py-2 text-[12px] font-bold text-[#F97316] transition-colors hover:bg-[#FFF7ED]"
          >
            კიდევ ნახე
          </Link>
        </div>
      </div>

      {/* ═══ 3. Hot Offers + Smart Match Side-by-Side ═══ */}
      <section className="mx-auto w-full max-w-[1160px] px-4 pb-16 pt-8 sm:pt-10">
        <ScrollReveal>
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-[26px] font-black leading-[32px] text-[#1E293B]">
                ცხელი შეთავაზებები
              </h2>
              <p className="mt-1 text-[13px] font-medium leading-[20px] text-[#64748B]">
                მხოლოდ ვერიფიცირებული და სანდო მესაკუთრეები.
              </p>
            </div>
            <div className="hidden items-center gap-3 rounded-full border border-[#FFEDD5] bg-[#FFF7ED] px-4 py-2 sm:flex">
              <span className="flex items-center gap-1.5 text-[12px] font-bold text-[#F97316]">
                <span className="text-[12px]">{"\uD83D\uDD25"}</span>
                მხოლოდ ფასდაკლებები
              </span>
              <div className="relative inline-flex h-[16px] w-[36px] cursor-pointer items-center rounded-full bg-[#F97316]">
                <span className="absolute right-0 size-[20px] -translate-y-0 rounded-full border-[4px] border-[#F97316] bg-white" />
              </div>
            </div>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {hotOfferCards.slice(0, 2).map((p) => (
              <ScrollReveal key={p.id}>
                <PropertyCard {...p} />
              </ScrollReveal>
            ))}
          </div>
          <div className="lg:col-span-1">
            <ScrollReveal delay={0.1}>
              <SmartMatchCard notificationCount={5} onClick={() => {}} />
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ═══ 4. Hotels Section ═══ */}
      <PropertySection
        title="სასტუმროები"
        subtitle="სრული სერვისი: საუზმე, აუზი, სპა"
        properties={hotelCards}
        href="/hotels"
        muted
        showDiscountToggle
        showAddButton
      />

      {/* ═══ 5. Apartments Section ═══ */}
      <PropertySection
        title="აპარტამენტები და კოტეჯები"
        subtitle="საუკეთესო არჩევანი თქვენი დასვენებისთვის"
        properties={hotOfferCards.slice(0, 4)}
        href="/apartments"
        showDiscountToggle
        showAddButton
      />

      {/* ═══ 5.5 Favourite service promo ═══ */}
      <section className="px-4 pb-8 pt-4">
        <div className="mx-auto max-w-[1160px]">
          <ScrollReveal>
            <div className="relative flex flex-col overflow-hidden rounded-[24px] border border-[#FEF3C7] bg-[#FFFBEB] shadow-[0px_1px_3px_rgba(0,0,0,0.04)] md:h-[180px] md:flex-row">
              <div className="relative h-[180px] w-full shrink-0 md:w-[320px]">
                <Image
                  src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=500&fit=crop"
                  alt=""
                  fill
                  sizes="(max-width: 768px) 100vw, 320px"
                  className="object-cover"
                />
                <span className="absolute left-4 top-4 rounded-md bg-[#F59E0B] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
                  PROMO
                </span>
              </div>
              <div className="flex flex-1 flex-col items-start justify-center gap-3 px-6 py-6 md:flex-row md:items-center md:justify-between md:px-10">
                <div className="max-w-[520px]">
                  <h3 className="text-[22px] font-black leading-[28px] text-[#1E293B]">
                    საყვარელი სერვისი
                  </h3>
                  <p className="mt-2 text-[13px] font-medium leading-[20px] text-[#64748B]">
                    მოძებნეთ დადასტურებული და რეკომენდაციით გამორჩეული სერვისები
                    თქვენთვის ხელსაყრელ ფასად.
                  </p>
                </div>
                <Link
                  href="/services"
                  className="shrink-0 rounded-full border-2 border-[#F97316] bg-white px-6 py-3 text-[13px] font-bold text-[#F97316] transition-colors hover:bg-[#FFF7ED]"
                >
                  კიდევ ნახე
                </Link>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ═══ 6. Transport Section ═══ */}
      <ServiceSection
        title="ტრანსპორტი და ტრანსფერები"
        subtitle="უსაფრთხო გადაადგილება ბაკურიანში და მის ფარგლებს გარეთ"
        cards={servicesByCategory("transport")}
        href="/transport"
        muted
        showAddButton
      />

      {/* ═══ 7. Services Section ═══ */}
      <ServiceSection
        title="სერვისები და ხელოსნები"
        subtitle="სწრაფი და საიმედო სერვისები თქვენი კომფორტისთვის"
        cards={servicesByCategory("handyman")}
        href="/services"
        showAddButton
        cardVariant="avatar"
      />

      {/* ═══ 8. Entertainment Section ═══ */}
      <ServiceSection
        title="გართობა და აქტივობები"
        subtitle="საუკეთესო გართობა და აქტივობები ბაკურიანში"
        cards={servicesByCategory("entertainment")}
        href="/entertainment"
        muted
        showAddButton
      />

      {/* ═══ 9. Food Section ═══ */}
      <ServiceSection
        title="კვება & რესტორნები"
        subtitle="საუკეთესო რესტორნები და კაფეები ბაკურიანში"
        cards={servicesByCategory("food")}
        href="/food"
        showAddButton
      />

      {/* ═══ 11. Employment Section ═══ */}
      <ServiceSection
        title="დასაქმება ბაკურიანში"
        subtitle="იპოვე შენი სასურველი ვაკანსია და დასაქმდი ბაკურიანში მარტივად"
        cards={servicesByCategory("employment")}
        href="/employment"
        muted
        showAddButton
      />

      {/* ═══ 12. Blog Section ═══ */}
      <section className="bg-brand-surface-muted px-4 py-16">
        <div className="mx-auto max-w-[1160px]">
          <ScrollReveal>
            <div className="mb-8 flex items-center justify-between">
              <h2 className="text-[26px] font-black leading-[32px] text-[#1E293B]">
                ბლოგი და სიახლეები
              </h2>
              <Link
                href="/blog"
                className="flex items-center gap-1 text-[13px] font-bold text-[#0F172A] hover:underline"
              >
                ნახე ყველა <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </ScrollReveal>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {blogItems.map((post, i) => {
              const chipPalette = [
                { bg: "#DBEAFE", fg: "#1D4ED8", label: "სიახლეები" },
                { bg: "#DCFCE7", fg: "#166534", label: "გზამკვლევი" },
                { bg: "#FFEDD5", fg: "#C2410C", label: "სეზონი" },
              ];
              const chip = chipPalette[i % chipPalette.length];
              const fallbackPhotos = [
                "https://images.unsplash.com/photo-1551524559-8af4e6624178?w=800&h=600&fit=crop",
                "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&h=600&fit=crop",
                "https://images.unsplash.com/photo-1605540436563-5bca919ae766?w=800&h=600&fit=crop",
              ];
              const imgSrc =
                post.image && post.image !== "/placeholder-property.jpg"
                  ? post.image
                  : fallbackPhotos[i % fallbackPhotos.length];
              return (
                <ScrollReveal key={post.id} delay={i * 0.1}>
                  <Link
                    href={`/blog/${post.id}`}
                    className="group block overflow-hidden rounded-[24px] border border-[#E2E8F0] bg-white shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[var(--shadow-card-hover)]"
                  >
                    <div className="relative aspect-[8/5] overflow-hidden">
                      <Image
                        src={imgSrc}
                        alt={post.title}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <span
                        className="absolute left-4 top-4 rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-wide"
                        style={{ backgroundColor: chip.bg, color: chip.fg }}
                      >
                        {chip.label}
                      </span>
                    </div>
                    <div className="p-6">
                      <time className="text-[11px] font-medium text-[#94A3B8]">
                        {post.date}
                      </time>
                      <h3 className="mt-1 text-[17px] font-black leading-[21px] text-[#1E293B]">
                        {post.title}
                      </h3>
                      <p className="mt-2 text-[13px] leading-[21px] text-[#64748B] line-clamp-2">
                        {post.excerpt}
                      </p>
                    </div>
                  </Link>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ 13. CTA before footer ═══ */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <ScrollReveal>
            <h2 className="text-2xl font-black md:text-3xl">
              გქონდეთ ობიექტი ბაკურიანში?
            </h2>
            <p className="mt-2 text-[13px] font-medium leading-[20px] text-[#64748B]">
              დაამატეთ თქვენი განცხადება და მიიღეთ შეკვეთები დღესვე
            </p>
            <Link
              href="/create"
              className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-brand-accent px-8 text-[13px] font-bold text-white shadow-[0px_4px_6px_-1px_rgba(0,0,0,0.1),0px_2px_4px_-2px_rgba(0,0,0,0.1)] transition-colors hover:bg-brand-accent-hover"
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
  subtitle,
  cards,
  href,
  muted,
  showDiscountToggle,
  showAddButton,
  cardVariant,
}: {
  title: string;
  subtitle?: string;
  cardVariant?: "photo" | "avatar";
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
  showDiscountToggle?: boolean;
  showAddButton?: boolean;
}) {
  return (
    <section className={`px-4 py-16 ${muted ? "bg-brand-surface-muted" : ""}`}>
      <div className="mx-auto max-w-[1160px]">
        <ScrollReveal>
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-[26px] font-black leading-[32px] text-[#1E293B]">
                {title}
              </h2>
              {subtitle && (
                <p className="mt-1 text-[13px] font-medium leading-[20px] text-[#64748B]">
                  {subtitle}
                </p>
              )}
            </div>
            <div className="hidden items-center gap-4 sm:flex">
              {showDiscountToggle && (
                <div className="flex items-center gap-3 rounded-full border border-[#FFEDD5] bg-[#FFF7ED] px-4 py-2">
                  <span className="flex items-center gap-1.5 text-[12px] font-bold text-[#F97316]">
                    <span className="text-[12px]">{"\uD83D\uDD25"}</span>
                    მხოლოდ ფასდაკლებები
                  </span>
                  <div className="relative inline-flex h-[16px] w-[36px] cursor-pointer items-center rounded-full bg-[#F97316]">
                    <span className="absolute right-0 size-[20px] -translate-y-0 rounded-full border-[4px] border-[#F97316] bg-white" />
                  </div>
                </div>
              )}
              {showAddButton && (
                <Link
                  href="/create"
                  className="inline-flex items-center gap-1 rounded-full border border-[#E2E8F0] px-4 py-2 text-[13px] font-bold text-[#1E293B] transition-colors hover:bg-[#F8FAFC]"
                >
                  <Plus className="h-4 w-4" />
                  დამატება
                </Link>
              )}
              <Link
                href={href}
                className="flex items-center gap-1 text-[13px] font-bold text-[#0F172A] hover:underline"
              >
                ნახე ყველა <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </ScrollReveal>
        <div className="scrollbar-hide -mx-4 flex gap-6 overflow-x-auto px-4 scroll-smooth snap-x">
          {cards.map((card, i) => (
            <ScrollReveal key={card.id} delay={i * 0.08} className="h-full">
              <div
                className={`h-full shrink-0 snap-start ${cardVariant === "avatar" ? "w-[280px]" : "w-[340px]"}`}
              >
                <ServiceCard {...card} variant={cardVariant} />
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function PropertySection({
  title,
  subtitle,
  properties,
  href,
  muted,
  showDiscountToggle,
  showAddButton,
}: {
  title: string;
  subtitle?: string;
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
    isHotel?: boolean;
    numericRating?: number;
    isB2BPartner?: boolean;
    hotelStars?: number;
    roomType?: string;
    amenities?: string;
  }>;
  href: string;
  muted?: boolean;
  showDiscountToggle?: boolean;
  showAddButton?: boolean;
}) {
  return (
    <section className={`px-4 py-16 ${muted ? "bg-brand-surface-muted" : ""}`}>
      <div className="mx-auto max-w-[1160px]">
        <ScrollReveal>
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-[26px] font-black leading-[32px] text-[#1E293B]">
                {title}
              </h2>
              {subtitle && (
                <p className="mt-1 text-[13px] font-medium leading-[20px] text-[#64748B]">
                  {subtitle}
                </p>
              )}
            </div>
            <div className="hidden items-center gap-4 sm:flex">
              {showDiscountToggle && (
                <div className="flex items-center gap-3 rounded-full border border-[#FFEDD5] bg-[#FFF7ED] px-4 py-2">
                  <span className="flex items-center gap-1.5 text-[12px] font-bold text-[#F97316]">
                    <span className="text-[12px]">{"\uD83D\uDD25"}</span>
                    მხოლოდ ფასდაკლებები
                  </span>
                  <div className="relative inline-flex h-[16px] w-[36px] cursor-pointer items-center rounded-full bg-[#F97316]">
                    <span className="absolute right-0 size-[20px] -translate-y-0 rounded-full border-[4px] border-[#F97316] bg-white" />
                  </div>
                </div>
              )}
              {showAddButton && (
                <Link
                  href="/create"
                  className="inline-flex items-center gap-1 rounded-full border border-[#E2E8F0] px-4 py-2 text-[13px] font-bold text-[#1E293B] transition-colors hover:bg-[#F8FAFC]"
                >
                  <Plus className="h-4 w-4" />
                  დამატება
                </Link>
              )}
              <Link
                href={href}
                className="flex items-center gap-1 text-[13px] font-bold text-[#0F172A] hover:underline"
              >
                ნახე ყველა <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </ScrollReveal>
        <div className="scrollbar-hide -mx-4 flex gap-6 overflow-x-auto px-4 scroll-smooth snap-x">
          {properties.map((prop, i) => (
            <ScrollReveal key={prop.id} delay={i * 0.08} className="h-full">
              <div className="h-full w-[340px] shrink-0 snap-start">
                <PropertyCard {...prop} />
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
