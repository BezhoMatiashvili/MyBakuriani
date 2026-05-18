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
