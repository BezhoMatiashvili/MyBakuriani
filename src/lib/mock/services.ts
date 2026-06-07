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
  driverName?: string;
  vehicleMake?: string;
  vehicleCapacity?: number;
  vehicleColor?: string;
  features?: string[];
  languages?: string[];
  route?: string;
  zone?: string;
  rating?: number;
  establishmentType?: string;
  isOpen?: boolean;
  serviceTags?: string[];
  extraPhotos?: string[];
  avgCheck?: string;
  cuisineType?: string;
  menuUrl?: string;
  description?: string;
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
  vehicleMake?: string | null;
  vehicleColor?: string | null;
  vehicleCapacity?: number | null;
  features?: string[] | null;
  route?: string | null;
  isNew?: boolean;
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
        "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&h=800&fit=crop",
      price: 250,
      unit: "მგზავრი",
      discount: 10,
      vip: true,
      phone: "+995599100001",
      driverName: "გოგა მ.",
      vehicleMake: "Mercedes Vito (მინივენი)",
      vehicleCapacity: 8,
      vehicleColor: "მწვანე",
      features: ["კონდიციონერი", "Wi-Fi"],
      languages: ["ქართული", "English", "Русский"],
      route: "თბილისი - ბაკურიანი",
    },
    {
      title: "სათხილამურო ტრანსფერი დიდველზე",
      photo:
        "https://images.unsplash.com/photo-1539635278303-d4002c07eae3?w=800&h=600&fit=crop",
      price: 20,
      unit: "მგზავრობა",
      discount: 0,
      vip: false,
      phone: "+995599100002",
      vehicleMake: "Toyota Land Cruiser",
      vehicleCapacity: 6,
      vehicleColor: "თეთრი",
      features: ["კონდიციონერი"],
    },
    {
      title: "ჯიპ-ტური მთებში",
      photo:
        "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop",
      price: 200,
      unit: "ტური",
      discount: 0,
      vip: false,
      phone: "+995599100003",
      vehicleMake: "Mitsubishi Delica",
      vehicleCapacity: 7,
      vehicleColor: "შავი",
      features: ["კონდიციონერი", "მუსიკა"],
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
      phone: "+995599200001",
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
      phone: "+995599200002",
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
      phone: "+995599200003",
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
      phone: "+995599200004",
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
      phone: "+995599300001",
    },
    {
      title: "ცხენებით სეირნობა",
      photo:
        "https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?w=800&h=600&fit=crop",
      price: 60,
      unit: "სეირნობა",
      discount: 0,
      vip: false,
      phone: "+995599300002",
    },
    {
      title: 'SPA & საუნა „რელაქსი"',
      photo:
        "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=800&h=600&fit=crop",
      price: 120,
      unit: "ვიზიტი",
      discount: 0,
      vip: false,
      phone: "+995599300003",
    },
  ],
  food: [
    {
      title: "კოსტას კაფე",
      photo:
        "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=1600&h=1200&fit=crop",
      price: 25,
      unit: "კერძი",
      discount: 0,
      vip: false,
      hours: "09:00 - 21:00",
      phone: "+995599123456",
      zone: "კოხტა",
      rating: 4.7,
      establishmentType: "კაფე / საკონდიტრო",
      cuisineType: "ევროპული",
      avgCheck: "10-30 ₾",
      isOpen: true,
      menuUrl: "https://example.com/menu.pdf",
      description:
        "კაფე კოსტაში ყავით, დესერტით და მსუბუქი ევროპული მენიუთი. იდეალური ადგილი დასვენებისთვის სრიალის შემდეგ. გთავაზობთ მყუდრო გარემოს, უმაღლესი ხარისხის მომსახურებას და ულამაზეს ხედებს.",
      serviceTags: ["საბავშვო კუთხე / ანიმატორები", "მოსაწევი ზონა / ტერასა"],
      extraPhotos: [
        "https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=1200&h=900&fit=crop",
        "https://images.unsplash.com/photo-1600891964599-f61ba0e24092?w=1200&h=900&fit=crop",
        "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=1200&h=900&fit=crop",
        "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&h=900&fit=crop",
        "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200&h=900&fit=crop",
        "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&h=900&fit=crop",
        "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=1200&h=900&fit=crop",
      ],
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
    vehicleMake: item.vehicleMake ?? null,
    vehicleColor: item.vehicleColor ?? null,
    vehicleCapacity: item.vehicleCapacity ?? null,
    features: item.features ?? null,
    route: item.route ?? null,
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

export type FoodExtras = {
  zone: string | null;
  rating: number | null;
  establishment_type: string | null;
  is_open: boolean | null;
  service_tags: string[] | null;
  extra_photos: string[] | null;
};

export type ServiceWithFoodExtras = ServiceWithProfile & {
  food_extras?: FoodExtras;
};

export function getMockService(id: string): ServiceWithFoodExtras | null {
  const match = MOCK_ID_PATTERN.exec(id);
  if (!match) return null;

  const category = match[1] as MockCategory;
  const index = Number.parseInt(match[2], 10) - 1;
  const item = MOCK_SERVICES_BY_CATEGORY[category]?.[index];
  if (!item) return null;

  const epoch = new Date(0).toISOString();

  return {
    accommodation: null,
    activity_category: null,
    activity_type: null,
    admin_notes: null,
    age_min: null,
    avg_check: item.avgCheck ?? null,
    coords: null,
    duration: null,
    good_for: null,
    category: category as ServiceCategory,
    created_at: epoch,
    cuisine_type: item.cuisineType ?? null,
    currency: "GEL",
    description: item.description ?? null,
    discount_percent: item.discount,
    driver_name: item.driverName ?? null,
    employment_schedule: null,
    employment_type: null,
    equipment: null,
    experience_required: null,
    features: item.features ?? null,
    has_delivery: null,
    has_kids_area: false,
    has_live_music: false,
    has_lounge: false,
    id,
    is_new: false,
    is_vip: item.vip,
    languages: item.languages ?? null,
    location: "ბაკურიანი",
    meals: null,
    menu: null,
    menu_url: item.menuUrl ?? null,
    menu_views_count: 0,
    operating_hours: item.hours ?? null,
    owner_id: "mock-owner",
    phone: item.phone ?? null,
    photos: [item.photo, ...(item.extraPhotos ?? [])],
    position: null,
    price: item.price,
    price_unit: item.unit,
    provider_name: item.providerName ?? null,
    service_field: null,
    requirements: null,
    restaurant_type: item.establishmentType ?? null,
    rating: null,
    reviews_count: null,
    safety_notes: null,
    route: item.route ?? null,
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
    vehicle_capacity: item.vehicleCapacity ?? null,
    vehicle_color: item.vehicleColor ?? null,
    vehicle_make: item.vehicleMake ?? null,
    views_count: 0,
    work_schedule: null,
    profiles: null,
    food_extras: {
      zone: item.zone ?? null,
      rating: item.rating ?? null,
      establishment_type: item.establishmentType ?? null,
      is_open: item.isOpen ?? null,
      service_tags: item.serviceTags ?? null,
      extra_photos: item.extraPhotos ?? null,
    },
  };
}
