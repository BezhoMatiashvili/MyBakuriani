import type { Tables } from "@/lib/types/database";

export type MockPropertyCard = {
  id: string;
  title: string;
  location: string;
  photos: string[];
  pricePerNight: number | null;
  salePrice: number | null;
  rating: number | null;
  capacity: number;
  rooms: number;
  isVip: boolean;
  isSuperVip: boolean;
  discountPercent: number;
  isForSale: boolean;
};

export type MockHotelCard = MockPropertyCard & {
  isHotel: true;
  hotelStars: number;
  numericRating: number;
  isB2BPartner: boolean;
  roomType: string;
  amenities: string;
};

export const MOCK_PROPERTIES: MockPropertyCard[] = [
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
];

export const MOCK_HOTELS: MockHotelCard[] = [
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

export const MOCK_SALE_APARTMENTS: MockPropertyCard[] = [
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

export type MockSaleCard = {
  id: string;
  title: string;
  location: string;
  photos: string[];
  priceUsd: number;
  area: number;
  rooms: number;
  roi: number;
};

export const MOCK_SALES: MockSaleCard[] = [
  {
    id: "sale-1",
    title: "სტუდიო აპარტამენტი",
    location: "ცენტრი",
    photos: [
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&h=600&fit=crop",
    ],
    priceUsd: 32_000,
    area: 28,
    rooms: 1,
    roi: 14,
  },
  {
    id: "sale-2",
    title: "თანამედროვე ლოფტი",
    location: "ბაკურიანის ველი",
    photos: [
      "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&h=600&fit=crop",
    ],
    priceUsd: 52_000,
    area: 42,
    rooms: 2,
    roi: 11,
  },
  {
    id: "sale-3",
    title: "მყუდრო საოჯახო ბინა",
    location: "მზესოური",
    photos: [
      "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800&h=600&fit=crop",
    ],
    priceUsd: 48_500,
    area: 55,
    rooms: 2,
    roi: 13,
  },
  {
    id: "sale-4",
    title: "ოთხოთახიანი ბინა დიდველთან",
    location: "დიდველი",
    photos: [
      "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&h=600&fit=crop",
    ],
    priceUsd: 88_000,
    area: 96,
    rooms: 3,
    roi: 12,
  },
  {
    id: "sale-5",
    title: "ორსართულიანი კოტეჯი",
    location: "კოხტა",
    photos: [
      "https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=800&h=600&fit=crop",
    ],
    priceUsd: 135_000,
    area: 160,
    rooms: 4,
    roi: 10,
  },
  {
    id: "sale-6",
    title: "ოროთახიანი ბინა",
    location: "25-იანები",
    photos: [
      "https://images.unsplash.com/photo-1502672023488-70e25813eb80?w=800&h=600&fit=crop",
    ],
    priceUsd: 62_400,
    area: 45,
    rooms: 2,
    roi: 11,
  },
];

const USD_TO_GEL = 2.7;

export type MockFeaturedCard = MockSaleCard & { description: string };

export const MOCK_FEATURED_SALES: MockFeaturedCard[] = [
  {
    id: "featured-mziuri",
    title: "Mziuri Gardens • პრემიუმ ვილა",
    location: "ბაკურიანის ცენტრი",
    photos: [
      "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1400&h=900&fit=crop",
    ],
    priceUsd: 280_000,
    area: 185,
    rooms: 5,
    roi: 12,
    description:
      "სრულად გარემონტებული, ევროპული სტანდარტის ვილა და ჩართული ავეჯით. კომპლექსში მოქმედებს 5-ვარსკვლავიანი ინფრასტრუქტურა.",
  },
  {
    id: "featured-didveli",
    title: "Didveli Heights • პრემიუმ აპარტამენტი",
    location: "დიდველი, 80 მ ტრასამდე",
    photos: [
      "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1400&h=900&fit=crop",
    ],
    priceUsd: 195_000,
    area: 120,
    rooms: 3,
    roi: 14,
    description:
      "სათხილამურო ტრასასთან, პანორამული ხედით კოხტას მთაზე. გარემონტებული Smart-Home სისტემით და ცენტრალური გათბობით.",
  },
  {
    id: "featured-kokhta",
    title: "Kokhta Suites • A-Frame კომპლექსი",
    location: "კოხტა, ტყის პირას",
    photos: [
      "https://images.unsplash.com/photo-1518602164578-cd0074062767?w=1400&h=900&fit=crop",
    ],
    priceUsd: 145_000,
    area: 95,
    rooms: 2,
    roi: 16,
    description:
      "მოდერნული A-Frame არქიტექტურა, ბუხრით და ფართო ტერასით. იდეალური მცირე-ოჯახური ან Airbnb ინვესტიციისთვის.",
  },
];

const MOCK_PROPERTY_PATTERN = /^(prop|hotel|apt|sale)-\d+$|^featured-[a-z]+$/;

export function isMockPropertyId(id: string): boolean {
  return MOCK_PROPERTY_PATTERN.test(id);
}

type PropertyWithProfile = Tables<"properties"> & {
  profiles: Tables<"profiles"> | null;
};

function buildMockProperty(
  source: MockPropertyCard | MockHotelCard,
  type: Tables<"properties">["type"],
): PropertyWithProfile {
  const epoch = new Date(0).toISOString();
  const isHotel = (source as MockHotelCard).isHotel === true;
  const hotel = isHotel ? (source as MockHotelCard) : null;

  return {
    amenities: hotel ? { description: hotel.amenities } : null,
    area_sqm: null,
    bathrooms: null,
    cadastral_code: null,
    capacity: source.capacity,
    cleaning_fee: null,
    completion_year: null,
    construction_progress_percent: null,
    construction_status: null,
    created_at: epoch,
    currency: "GEL",
    description: null,
    developer: null,
    discount_percent: source.discountPercent,
    distance_to_slope_m: null,
    hotel_stars: hotel?.hotelStars ?? null,
    house_rules: null,
    id: source.id,
    is_b2b_partner: hotel?.isB2BPartner ?? null,
    is_for_sale: source.isForSale,
    is_super_vip: source.isSuperVip,
    is_vip: source.isVip,
    location: source.location,
    location_lat: null,
    location_lng: null,
    min_booking_days: null,
    numeric_rating: hotel?.numericRating ?? null,
    owner_id: "mock-owner",
    photos: source.photos,
    price_per_night: source.pricePerNight,
    progress_note: null,
    progress_note_updated_at: null,
    renovation_status: null,
    roi_percent: null,
    room_type: hotel?.roomType ?? null,
    rooms: source.rooms,
    sale_price: source.salePrice,
    status: "active",
    title: source.title,
    type,
    updated_at: epoch,
    views_count: 0,
    vip_expires_at: null,
    profiles: null,
  };
}

function buildMockSaleProperty(
  source: MockSaleCard,
  description: string | null = null,
): PropertyWithProfile {
  const epoch = new Date(0).toISOString();
  // 7 days ago, so "განცხადება: 7 დღის წინ" renders
  const posted = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const richDescription =
    description ??
    `${source.title} — საინვესტიციო შესაძლებლობა ბაკურიანის ${source.location}-ში. ${source.area} მ² ფართობი, ${source.rooms} ოთახი, თანამედროვე გეგმარება და ხარისხიანი მასალები.\n\nობიექტი ემსახურება სტუმარის ბაზრის ფართო სეგმენტს და უზრუნველყოფს მდგრად შემოსავალს მთელი წლის განმავლობაში. მოსალოდნელი ROI ${source.roi}% წლიური, რაც კატეგორიულად აღემატება ბანკის სადეპოზიტო განაკვეთს.`;
  return {
    amenities: ["complex_management", "concierge", "security"],
    area_sqm: source.area,
    bathrooms: source.rooms,
    cadastral_code: "01.16.21.479.481",
    capacity: source.rooms * 2,
    cleaning_fee: null,
    completion_year: 2027,
    construction_progress_percent: 45,
    construction_status: "under_construction",
    created_at: posted,
    currency: "GEL",
    description: richDescription,
    developer: "CRYSTAL RESORT (BLOCK D)",
    discount_percent: 0,
    distance_to_slope_m: null,
    hotel_stars: null,
    house_rules: null,
    id: source.id,
    is_b2b_partner: null,
    is_for_sale: true,
    is_super_vip: false,
    is_vip: false,
    location: `${source.location}, კრისტალი`,
    location_lat: 41.7491,
    location_lng: 43.5236,
    min_booking_days: null,
    numeric_rating: null,
    owner_id: "mock-owner",
    phone: "+995595120120",
    photos: source.photos,
    price_per_night: null,
    progress_note: null,
    progress_note_updated_at: null,
    registration_readiness: "მე-4 კვარტალი, 2027",
    whatsapp: "+995595120120",
    renovation_status: null,
    roi_percent: source.roi,
    room_type: null,
    rooms: source.rooms,
    sale_price: Math.round(source.priceUsd * USD_TO_GEL),
    status: "active",
    title: source.title,
    type: "apartment",
    updated_at: epoch,
    views_count: 247,
    vip_expires_at: null,
    profiles: {
      admin_notes: null,
      avatar_url: null,
      bio: null,
      created_at: epoch,
      display_name: "გიორგი მაშულაშვილი",
      id: "mock-owner",
      is_verified: true,
      notification_prefs: null,
      personal_id: null,
      phone: "+995595120120",
      profile_type: null,
      rating: 4.8,
      response_time_minutes: 30,
      role: "seller",
      updated_at: epoch,
      verified_at: epoch,
      whatsapp_enabled: true,
    },
  };
}

export function getMockProperty(id: string): PropertyWithProfile | null {
  if (id.startsWith("hotel-")) {
    const item = MOCK_HOTELS.find((h) => h.id === id);
    return item ? buildMockProperty(item, "hotel") : null;
  }
  if (id.startsWith("apt-")) {
    const item = MOCK_SALE_APARTMENTS.find((a) => a.id === id);
    return item ? buildMockProperty(item, "apartment") : null;
  }
  if (id.startsWith("sale-")) {
    const item = MOCK_SALES.find((s) => s.id === id);
    return item ? buildMockSaleProperty(item) : null;
  }
  if (id.startsWith("featured-")) {
    const item = MOCK_FEATURED_SALES.find((s) => s.id === id);
    return item ? buildMockSaleProperty(item, item.description) : null;
  }
  if (id.startsWith("prop-")) {
    const item = MOCK_PROPERTIES.find((p) => p.id === id);
    return item ? buildMockProperty(item, "apartment") : null;
  }
  return null;
}
