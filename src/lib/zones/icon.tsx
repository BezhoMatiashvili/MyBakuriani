import { Mountain, TreePine, MapPin } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const ZONE_ICON_VALUES = ["mountain", "tree", "pin"] as const;
export type ZoneIconValue = (typeof ZONE_ICON_VALUES)[number];

const ICON_MAP: Record<ZoneIconValue, LucideIcon> = {
  mountain: Mountain,
  tree: TreePine,
  pin: MapPin,
};

export function ZoneIcon({
  icon,
  className,
}: {
  icon: string;
  className?: string;
}) {
  const Component =
    ICON_MAP[
      (icon as ZoneIconValue) in ICON_MAP ? (icon as ZoneIconValue) : "mountain"
    ];
  return <Component className={className} />;
}

export function getZoneLucideIcon(icon: string): LucideIcon {
  return ICON_MAP[
    (icon as ZoneIconValue) in ICON_MAP ? (icon as ZoneIconValue) : "mountain"
  ];
}
