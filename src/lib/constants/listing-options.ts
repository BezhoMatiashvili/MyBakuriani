export type AmenityGroup = {
  key: string;
  label: string;
  options: { key: string; label: string }[];
};

export const AMENITY_GROUPS: AmenityGroup[] = [
  {
    key: "winter",
    label: "ზამთრის ინფრასტრუქტურა",
    options: [
      { key: "ski_in_out", label: "Ski-in / Ski-out" },
      { key: "ski_storage", label: "თხილამურების სათავსო" },
      { key: "backup_generator", label: "სარეზერვო გენერატორი" },
      { key: "fireplace", label: "ბუხარი" },
    ],
  },
  {
    key: "comfort",
    label: "საბაზისო კომფორტი",
    options: [
      { key: "parking", label: "პარკინგი" },
      { key: "wifi", label: "უფასო Wi-Fi" },
      { key: "central_heating", label: "ცენტრალური გათბობა" },
      { key: "tv", label: "ტელევიზორი" },
    ],
  },
  {
    key: "kitchen",
    label: "სამზარეულო და საყოფაცხოვრებო",
    options: [
      { key: "washing_machine", label: "სარეცხი მანქანა" },
      { key: "dishwasher", label: "ჭურჭლის სარეცხი მანქანა" },
      { key: "full_kitchen", label: "სრულად აღჭურვილი სამზარეულო" },
      { key: "coffee_maker", label: "ყავის აპარატი" },
    ],
  },
  {
    key: "outdoor",
    label: "აივანი / გარე სივრცე",
    options: [
      { key: "no_balcony", label: "არ აქვს" },
      { key: "french_balcony", label: "ფრანგული აივანი" },
      { key: "standard_balcony", label: "სტანდარტული აივანი" },
      { key: "large_terrace", label: "დიდი ტერასა" },
      { key: "yard", label: "ეზო" },
    ],
  },
];

export const HOSTING_LANGS: { key: string; label: string }[] = [
  { key: "ka", label: "ქართული" },
  { key: "en", label: "English" },
  { key: "ru", label: "Русский" },
  { key: "ar", label: "Arabic" },
];

export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  apartment: "აპარტამენტი",
  studio: "სტუდიო",
  cottage: "კოტეჯი",
  hotel: "სასტუმრო ოთახი",
  villa: "ვილა",
};

export const SERVICE_CATEGORY_LABELS: Record<string, string> = {
  food: "კვება",
  transport: "ტრანსპორტი",
  entertainment: "გართობა",
  employment: "სამუშაო",
  handyman: "ხელოსანი",
  cleaning: "დასუფთავება",
};

export const LISTING_STATUS_LABELS: Record<string, string> = {
  active: "აქტიური",
  blocked: "დაბლოკილი",
  pending: "მოლოდინში",
  draft: "შავი ვარიანტი",
};

export const FOOD_AMENITIES = [
  { key: "has_kids_area", label: "საბავშვო სივრცე" },
  { key: "has_lounge", label: "მოწევის ზონა" },
  { key: "has_delivery", label: "მიტანის სერვისი" },
  { key: "has_live_music", label: "ცოცხალი მუსიკა" },
] as const;

export type FoodAmenityKey = (typeof FOOD_AMENITIES)[number]["key"];

// Shared food option lists — single source of truth for the /create/food form
// and the /food/[id] detail page.
export const RESTAURANT_TYPES = [
  { value: "restaurant", label: "რესტორანი" },
  { value: "cafe", label: "კაფე / საკონდიტრო" },
  { value: "bar", label: "ბარი / პაბი" },
  { value: "fast_food", label: "სწრაფი კვება" },
  { value: "other", label: "სხვა" },
];

export const CUISINE_TYPES = [
  { value: "georgian", label: "ქართული" },
  { value: "european", label: "ევროპული" },
  { value: "asian", label: "აზიური" },
  { value: "mixed", label: "შერეული" },
];

export const AVG_CHECK_OPTIONS = [
  { value: "10-30", label: "10-30 ₾" },
  { value: "30-60", label: "30-60 ₾" },
  { value: "60-100", label: "60-100 ₾" },
  { value: "100+", label: "100 ₾+" },
];

// Resolve a stored value to its Georgian label. The create form saves labels,
// while seed/legacy rows store raw codes (e.g. "georgian"). Handles both, and
// passes through any unknown custom value unchanged.
function resolveLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string | null,
): string | null {
  if (!value) return null;
  return (
    options.find((o) => o.value === value)?.label ??
    options.find((o) => o.label === value)?.label ??
    value
  );
}

export function labelForRestaurantType(value: string | null): string | null {
  return resolveLabel(RESTAURANT_TYPES, value);
}

export function labelForCuisineType(value: string | null): string | null {
  return resolveLabel(CUISINE_TYPES, value);
}

// Comprehensive car-brand list for the /create/transport form (alphabetical,
// Latin names), with "სხვა" (Other) always last so owners can pick anything
// not listed.
const VEHICLE_MAKE_NAMES = [
  "Acura",
  "Alfa Romeo",
  "Aston Martin",
  "Audi",
  "Bentley",
  "BMW",
  "Buick",
  "BYD",
  "Cadillac",
  "Changan",
  "Chery",
  "Chevrolet",
  "Chrysler",
  "Citroen",
  "Dacia",
  "Daewoo",
  "Daihatsu",
  "Dodge",
  "DS",
  "Ferrari",
  "Fiat",
  "Ford",
  "GAZ",
  "Geely",
  "Genesis",
  "GMC",
  "Great Wall",
  "Haval",
  "Honda",
  "Hummer",
  "Hyundai",
  "Infiniti",
  "Isuzu",
  "Iveco",
  "Jaguar",
  "Jeep",
  "Kia",
  "Lada",
  "Lamborghini",
  "Lancia",
  "Land Rover",
  "Lexus",
  "Lincoln",
  "Lotus",
  "Maserati",
  "Maybach",
  "Mazda",
  "McLaren",
  "Mercedes-Benz",
  "Mercury",
  "MG",
  "Mini",
  "Mitsubishi",
  "Nissan",
  "Opel",
  "Peugeot",
  "Polestar",
  "Pontiac",
  "Porsche",
  "RAM",
  "Renault",
  "Rolls-Royce",
  "Rover",
  "Saab",
  "SEAT",
  "Skoda",
  "Smart",
  "SsangYong",
  "Subaru",
  "Suzuki",
  "Tank",
  "Tata",
  "Tesla",
  "Toyota",
  "UAZ",
  "Volkswagen",
  "Volvo",
  "Wuling",
  "Xpeng",
  "Zeekr",
  "ZAZ",
] as const;

export const VEHICLE_MAKES: { value: string; label: string }[] = [
  ...VEHICLE_MAKE_NAMES.map((m) => ({ value: m, label: m })),
  { value: "სხვა", label: "სხვა" },
];
