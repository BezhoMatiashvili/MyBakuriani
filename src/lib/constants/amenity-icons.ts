import {
  BadgeCheck,
  Building2,
  Car,
  Coffee,
  Fence,
  Flame,
  Heater,
  MountainSnow,
  Sun,
  Trees,
  Tv,
  UtensilsCrossed,
  Warehouse,
  WashingMachine,
  Wifi,
  Zap,
} from "lucide-react";

/** Icon per `ListingOptions.amenities` message key (resolved via `optionKeyFor`). */
export const AMENITY_ICONS: Record<string, React.ElementType> = {
  ski_in_out: MountainSnow,
  ski_storage: Warehouse,
  backup_generator: Zap,
  fireplace: Flame,
  parking: Car,
  wifi: Wifi,
  central_heating: Heater,
  heating: Heater,
  tv: Tv,
  washing_machine: WashingMachine,
  dishwasher: WashingMachine,
  full_kitchen: UtensilsCrossed,
  kitchen: UtensilsCrossed,
  coffee_maker: Coffee,
  no_balcony: Fence,
  french_balcony: Fence,
  standard_balcony: Fence,
  large_terrace: Sun,
  yard: Trees,
  bbq: Flame,
  complex_management: Building2,
};

/** Neutral vector icon for amenities with no specific icon — never blank, never emoji. */
export const DEFAULT_AMENITY_ICON: React.ElementType = BadgeCheck;

// Pictographic emoji, dingbats, symbols, variation selectors, ZWJ.
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{FE0F}\u{200D}]/gu;

/** Strip emoji from a raw (unmapped) amenity value so it can never render one. */
export function cleanAmenityLabel(value: string): string {
  return value.replace(EMOJI_RE, "").replace(/\s+/g, " ").trim();
}
