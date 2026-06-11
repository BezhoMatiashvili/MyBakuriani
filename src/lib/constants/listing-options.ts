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

// ---------------------------------------------------------------------------
// DB-value → message-key resolution.
//
// Create forms historically store Georgian labels in the services/properties
// tables (payloads stay unchanged — production data is live); newer fields
// store raw codes. Display sites resolve either form to a message key under
// `ListingOptions.<group>.<key>` via optionKeyFor(); unknown custom values
// resolve to null so callers can fall back to rendering the raw value.
// Maps mirror the messages/ka.json group values — keep them in sync.
// ---------------------------------------------------------------------------

const DB_VALUE_KEYS = {
  transportTypes: {
    მინივენი: "minivan",
    ტაქსი: "taxi",
    მიკროავტობუსი: "microbus",
    სხვა: "other",
  },
  priceUnits: {
    "მთლიანი მანქანა": "whole_car",
    გამოძახება: "on_demand",
    "ერთ კაცზე": "per_person",
    // Legacy free-text values present in production rows.
    "ერთი მიმართულება": "one_way",
    "ერთი ტური": "per_tour",
    მგზავრობა: "per_ride",
    "ერთი დღე": "per_day",
  },
  transportRoutes: {
    "შიდა გადაადგილება (ტაქსი)": "local",
    "თბილისი - ბაკურიანი - თბილისი": "tbilisi_roundtrip",
    "აეროპორტის ტრანსფერი": "airport",
    სხვა: "other",
    // Legacy free-text routes present in production rows.
    "თბილისი - ბაკურიანი": "tbilisi_oneway",
    "ბაკურიანის ტერიტორია": "bakuriani_area",
    "ტურები რეგიონში": "region_tours",
    "ტაბაწყური / მიტარბი": "tabatskuri_mitarbi",
  },
  vehicleEquipment: {
    "ზამთრის საბურავები": "winter_tires",
    "მოცურების ჯაჭვები": "chains",
    "თხილამურის საბარგული": "ski_rack",
    "დამატებითი საბარგული": "extra_rack",
    "ბავშვის სავარძელი": "child_seat",
  },
  vehicleColors: {
    თეთრი: "white",
    შავი: "black",
    ნაცრისფერი: "gray",
    ვერცხლისფერი: "silver",
    წითელი: "red",
    ლურჯი: "blue",
    ცისფერი: "light_blue",
    მწვანე: "green",
    ყვითელი: "yellow",
    ნარინჯისფერი: "orange",
    ყავისფერი: "brown",
    ოქროსფერი: "gold",
    სხვა: "other",
  },
  transportFeatures: {
    კონდიციონერი: "ac",
    "Wi-Fi": "wifi",
    "USB დამტენი": "usb",
    მუსიკა: "music",
    წყალი: "water",
    "ბავშვის სავარძელი": "child_seat",
  },
  // Includes native-name aliases written by /create/transport ("English", "Русский").
  languages: {
    ქართული: "ka",
    ინგლისური: "en",
    რუსული: "ru",
    სხვა: "other",
    English: "en",
    Русский: "ru",
  },
  restaurantTypes: {
    რესტორანი: "restaurant",
    "კაფე / საკონდიტრო": "cafe",
    "ბარი / პაბი": "bar",
    "სწრაფი კვება": "fast_food",
    სხვა: "other",
  },
  cuisineTypes: {
    ქართული: "georgian",
    ევროპული: "european",
    აზიური: "asian",
    შერეული: "mixed",
  },
  serviceSpheres: {
    "დასუფთავება/დამლაგებელი": "cleaning",
    ხელოსნები: "handymen",
    "მომსახურე პერსონალი": "staff",
    ტურიზმი: "tourism",
    "გაყიდვები/ვაჭრობა": "sales",
    სხვა: "other",
  },
  coverageZones: {
    "მთლიანი ბაკურიანი": "all_bakuriani",
    მიტარბი: "mitarbi",
    წალვერი: "tsalgeri",
  },
  entertainmentTypes: {
    ექსტრემალური: "extreme",
    სპორტული: "sport",
    ბავშვებისთვის: "kids",
    ოჯახისთვის: "family",
    სხვა: "other",
  },
  entertainmentCategories: {
    ინვენტარი: "inventory_rent",
    ცხენები: "horses",
    ბურანები: "buggies",
    კვადროციკლები: "quad_bikes",
    ბაგი: "buggy",
    სხვა: "other",
  },
  durations: {
    "15 წუთი": "15min",
    "30 წუთი": "30min",
    "1 საათი": "1h",
    "1+ საათი": "1h+",
  },
  ageOptions: { ნებისმიერი: "any" },
  audienceOptions: {
    ყველასთვის: "all",
    "ექსტრემის მოყვარულთა": "extreme_lovers",
  },
  pricePerOptions: {
    "15 წუთზე": "15min",
    "1 საათზე": "1h",
    "სრულ დღეზე": "full_day",
  },
  employmentTypes: {
    "სრული განაკვეთი": "full_time",
    "ნახევარი განაკვეთი": "part_time",
    მოქნილი: "flexible",
  },
  salaryTypes: {
    ფიქსირებული: "fixed",
    "ფიქსირებული + ბონუსი/Tips": "fixed_bonus",
    "გამომუშავებით (%)": "commission",
    შეთანხმებით: "negotiable",
  },
  experienceOptions: {
    სასურველია: "preferred",
    "არ არის აუცილებელი": "not_required",
    "1 წელი": "one_year",
    "1+ წელი": "one_plus_year",
  },
  accommodationOptions: { კი: "yes", არა: "no", შეთანხმებით: "negotiable" },
  mealsOptions: {
    "სრული კვება": "full",
    "ერთჯერადი კვება": "single",
    "არ შედის": "not_included",
  },
  salePropertyTypes: {
    სტუდიო: "studio",
    აპარტამენტი: "apartment",
    კოტეჯი: "cottage",
    "მიწის ნაკვეთი": "villa",
    "სასტუმრო ოთახი": "hotel",
  },
  constructionStatuses: {
    მშენებარე: "under_construction",
    "ახალი აშენებული/დასრულებული": "completed",
    // Codes written by the admin listing-audit panel (distinct vocabulary).
    "მზად ჩასახლებისთვის": "ready",
    დაგეგმილი: "planned",
  },
  handoverOptions: {
    "უკვე ჩაბარებული": "delivered",
    "2024 ბოლო": "2024_end",
    "2025 გაზაფხული": "2025_spring",
    "2026 ბოლო": "2026_end",
  },
  renovationStatuses: {
    "შავი კარკასი": "black_frame",
    "თეთრი კარკასი": "white_frame",
    "მწვანე კარკასი": "green_frame",
    გარემონტებული: "renovated",
    "სრულად მოწყობილი": "fully_furnished",
    // Codes written by the admin listing-audit panel (distinct vocabulary).
    "ახალი რემონტი": "new_renovation",
    "ძველი რემონტი": "old_renovation",
  },
  managementServices: {
    "აქვს კომპლექსის მენეჯმენტი": "complex_management",
    "არ აქვს": "none",
  },
  cleaningTypes: { სტანდარტული: "standard", გენერალური: "general" },
  // services.price_unit written by /create/service ("საათი"); the rest are
  // legacy free-text units present in production/mock rows.
  servicePriceUnits: {
    საათი: "hour",
    დღე: "day",
    ვიზიტი: "visit",
    პიროვნება: "person",
    სეანსი: "session",
    გაკვეთილი: "lesson",
    სეირნობა: "ride",
    კერძი: "dish",
    სასმელი: "drink",
    მგზავრი: "passenger",
    ტური: "tour",
  },
  propertyTypes: {
    აპარტამენტი: "apartment",
    სტუდიო: "studio",
    კოტეჯი: "cottage",
    "სასტუმრო ოთახი": "hotel",
    ვილა: "villa",
  },
  serviceCategories: {
    კვება: "food",
    ტრანსპორტი: "transport",
    გართობა: "entertainment",
    სამუშაო: "employment",
    ხელოსანი: "handyman",
    დასუფთავება: "cleaning",
  },
  listingStatuses: {
    აქტიური: "active",
    დაბლოკილი: "blocked",
    მოლოდინში: "pending",
    "შავი ვარიანტი": "draft",
  },
  amenities: {
    "Ski-in / Ski-out": "ski_in_out",
    "თხილამურების სათავსო": "ski_storage",
    "სარეზერვო გენერატორი": "backup_generator",
    ბუხარი: "fireplace",
    პარკინგი: "parking",
    "უფასო Wi-Fi": "wifi",
    "ცენტრალური გათბობა": "central_heating",
    ტელევიზორი: "tv",
    "სარეცხი მანქანა": "washing_machine",
    "ჭურჭლის სარეცხი მანქანა": "dishwasher",
    "სრულად აღჭურვილი სამზარეულო": "full_kitchen",
    "ყავის აპარატი": "coffee_maker",
    "არ აქვს": "no_balcony",
    "ფრანგული აივანი": "french_balcony",
    "სტანდარტული აივანი": "standard_balcony",
    "დიდი ტერასა": "large_terrace",
    ეზო: "yard",
  },
  hostingLangs: { ქართული: "ka", English: "en", Русский: "ru", Arabic: "ar" },
} satisfies Record<string, Record<string, string>>;

export type OptionGroup = keyof typeof DB_VALUE_KEYS;

/** Stored DB value (Georgian label or raw code) → `ListingOptions.<group>` message key. */
export function optionKeyFor(
  group: OptionGroup,
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const map: Record<string, string> = DB_VALUE_KEYS[group];
  if (Object.hasOwn(map, value)) return map[value];
  return Object.values(map).includes(value) ? value : null;
}

/**
 * Ordered form options: the exact DB payload value + its message key.
 * Not suitable for `languages` (contains alias entries for legacy payloads).
 */
export function dbOptionsFor(
  group: OptionGroup,
): { value: string; key: string }[] {
  return Object.entries(DB_VALUE_KEYS[group] as Record<string, string>).map(
    ([value, key]) => ({ value, key }),
  );
}

// price_unit is written by three forms — transport (codes), entertainment
// (Georgian pricePerOptions labels), service ("საათი") — so resolve across all
// groups, returning a full `ListingOptions` sub-path, e.g. "priceUnits.whole_car".
export function priceUnitPathFor(
  value: string | null | undefined,
): string | null {
  for (const group of [
    "priceUnits",
    "pricePerOptions",
    "servicePriceUnits",
    "durations",
  ] as const) {
    const key = optionKeyFor(group, value);
    if (key) return `${group}.${key}`;
  }
  return null;
}
