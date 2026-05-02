import type { Tables } from "@/lib/types/database";

type ServiceCategory = Tables<"services">["category"];

type ServiceMockData = {
  title: string;
  photo: string;
  price: number;
  unit: string;
  discount: number;
  vip: boolean;
  hours?: string;
  phone?: string;
  providerName?: string;
  experienceYears?: number;
  availabilityStatus?: "active" | "busy";
};

export type MockServiceCardItem = {
  id: string;
  title: string;
  category: string;
  location: string;
  photos: string[];
  price: number;
  priceUnit: string;
  discountPercent: number;
  isVip: boolean;
  operatingHours: string | null;
  phone: string | null;
  providerName: string | null;
  experienceYears: number | null;
  availabilityStatus: "active" | "busy" | null;
};

type MockCategory =
  | "transport"
  | "handyman"
  | "entertainment"
  | "food"
  | "employment";

export const MOCK_SERVICES_BY_CATEGORY: Record<
  MockCategory,
  ServiceMockData[]
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
      title: "პროფესიონალი დამლაგებელი",
      photo:
        "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&h=400&fit=crop",
      price: 80,
      unit: "დღე",
      discount: 0,
      vip: false,
      providerName: "ნინო",
      experienceYears: 8,
      availabilityStatus: "active",
      hours: "10:00 - 18:00",
    },
    {
      title: "გათბობის ქვაბის სპეციალისტი",
      photo:
        "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&h=400&fit=crop",
      price: 70,
      unit: "გამოძახება",
      discount: 0,
      vip: false,
      providerName: "გიორგი",
      experienceYears: 12,
      availabilityStatus: "active",
      hours: "10:00 - 23:00",
    },
    {
      title: "სანტექნიკოსი (გაყინული მილები)",
      photo:
        "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400&h=400&fit=crop",
      price: 60,
      unit: "გამოძახება",
      discount: 0,
      vip: false,
      providerName: "შოთა",
      experienceYears: 10,
      availabilityStatus: "busy",
      hours: "09:00 - 22:00",
    },
    {
      title: "თოვლის გაწმენდა (ტრაქტორი)",
      photo:
        "https://images.unsplash.com/photo-1516912481808-3406841bd33c?w=400&h=400&fit=crop",
      price: 120,
      unit: "სეანსი",
      discount: 0,
      vip: false,
      providerName: "დავითი",
      experienceYears: 1,
      availabilityStatus: "active",
      hours: "08:00 - 20:00",
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
      hours: "10:00 - 23:00",
      phone: "+995599123456",
    },
    {
      title: 'პიცერია „იტალიანო"',
      photo:
        "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&h=600&fit=crop",
      price: 18,
      unit: "კერძი",
      discount: 15,
      vip: false,
      hours: "11:00 - 22:00",
      phone: "+995599234567",
    },
    {
      title: 'კაფე-ბარი „თოვლის ბუნკერი"',
      photo:
        "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&h=600&fit=crop",
      price: 12,
      unit: "სასმელი",
      discount: 0,
      vip: false,
      hours: "09:00 - 00:00",
      phone: "+995599345678",
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

export function makeServiceCards(
  category: string,
  count: number,
): MockServiceCardItem[] {
  const items = MOCK_SERVICES_BY_CATEGORY[category as MockCategory] ?? [];
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
    operatingHours: item.hours ?? null,
    phone: item.phone ?? null,
    providerName: item.providerName ?? null,
    experienceYears: item.experienceYears ?? null,
    availabilityStatus: item.availabilityStatus ?? null,
  }));
}

const MOCK_ID_PATTERN =
  /^(transport|handyman|entertainment|food|employment)-(\d+)$/;

export function isMockServiceId(id: string): boolean {
  return MOCK_ID_PATTERN.test(id);
}

type ServiceWithProfile = Tables<"services"> & {
  profiles: Tables<"profiles"> | null;
};

export function getMockService(id: string): ServiceWithProfile | null {
  const match = MOCK_ID_PATTERN.exec(id);
  if (!match) return null;

  const category = match[1] as MockCategory;
  const index = Number.parseInt(match[2], 10) - 1;
  const item = MOCK_SERVICES_BY_CATEGORY[category]?.[index];
  if (!item) return null;

  const epoch = new Date(0).toISOString();

  return {
    accommodation: null,
    avg_check: null,
    category: category as ServiceCategory,
    created_at: epoch,
    cuisine_type: null,
    currency: "GEL",
    description: null,
    discount_percent: item.discount,
    driver_name: null,
    employment_schedule: null,
    employment_type: null,
    equipment: null,
    experience_required: null,
    has_delivery: null,
    has_kids_area: false,
    has_live_music: false,
    has_lounge: false,
    id,
    is_vip: item.vip,
    languages: null,
    location: "ბაკურიანი",
    meals: null,
    menu: null,
    menu_url: null,
    operating_hours: item.hours ?? null,
    owner_id: "mock-owner",
    phone: item.phone ?? null,
    photos: [item.photo],
    position: null,
    price: item.price,
    price_unit: item.unit,
    requirements: null,
    route: null,
    routes: null,
    salary_daily: null,
    salary_max: null,
    salary_min: null,
    salary_range: null,
    salary_type: null,
    schedule: null,
    status: "active",
    title: item.title,
    transport_type: null,
    updated_at: epoch,
    vehicle_capacity: null,
    vehicle_make: null,
    views_count: 0,
    work_schedule: null,
    profiles: null,
  };
}
