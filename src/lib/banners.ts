export type BannerKind = "info" | "promo" | "sticky_news";

export type BannerTone =
  | "orange"
  | "amber"
  | "blue"
  | "green"
  | "red"
  | "slate";

export type LandingBanner = {
  id: string;
  kind: BannerKind;
  title: string;
  body: string | null;
  cta_label: string | null;
  cta_href: string | null;
  image_url: string | null;
  video_url: string | null;
  video_poster_url: string | null;
  tone: BannerTone;
  active: boolean;
  start_at: string | null;
  end_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export const BANNER_KINDS: BannerKind[] = ["info", "promo", "sticky_news"];

export const BANNER_TONES: BannerTone[] = [
  "orange",
  "amber",
  "blue",
  "green",
  "red",
  "slate",
];

type TonePalette = {
  bg: string;
  border: string;
  badgeBg: string;
  iconBg: string;
  iconText: string;
  title: string;
  text: string;
  ctaText: string;
  ctaBorder: string;
};

export const BANNER_TONE_STYLES: Record<BannerTone, TonePalette> = {
  orange: {
    bg: "#FFF7ED",
    border: "#FFEDD5",
    badgeBg: "#F97316",
    iconBg: "#F97316",
    iconText: "#FFFFFF",
    title: "#7C2D12",
    text: "#9A3412",
    ctaText: "#F97316",
    ctaBorder: "#FFEDD5",
  },
  amber: {
    bg: "#FFFBEB",
    border: "#FEF3C7",
    badgeBg: "#F59E0B",
    iconBg: "#F59E0B",
    iconText: "#FFFFFF",
    title: "#1E293B",
    text: "#64748B",
    ctaText: "#F97316",
    ctaBorder: "#F97316",
  },
  blue: {
    bg: "#EFF6FF",
    border: "#DBEAFE",
    badgeBg: "#2563EB",
    iconBg: "#2563EB",
    iconText: "#FFFFFF",
    title: "#1E3A8A",
    text: "#1E40AF",
    ctaText: "#2563EB",
    ctaBorder: "#DBEAFE",
  },
  green: {
    bg: "#ECFDF5",
    border: "#D1FAE5",
    badgeBg: "#10B981",
    iconBg: "#10B981",
    iconText: "#FFFFFF",
    title: "#064E3B",
    text: "#047857",
    ctaText: "#10B981",
    ctaBorder: "#D1FAE5",
  },
  red: {
    bg: "#FEF2F2",
    border: "#FECACA",
    badgeBg: "#EF4444",
    iconBg: "#EF4444",
    iconText: "#FFFFFF",
    title: "#7F1D1D",
    text: "#B91C1C",
    ctaText: "#EF4444",
    ctaBorder: "#FECACA",
  },
  slate: {
    bg: "#F8FAFC",
    border: "#E2E8F0",
    badgeBg: "#0F172A",
    iconBg: "#0F172A",
    iconText: "#FFFFFF",
    title: "#0F172A",
    text: "#475569",
    ctaText: "#0F172A",
    ctaBorder: "#CBD5E1",
  },
};

export function isBannerKind(value: unknown): value is BannerKind {
  return (
    typeof value === "string" &&
    (BANNER_KINDS as readonly string[]).includes(value)
  );
}

export function isBannerTone(value: unknown): value is BannerTone {
  return (
    typeof value === "string" &&
    (BANNER_TONES as readonly string[]).includes(value)
  );
}
