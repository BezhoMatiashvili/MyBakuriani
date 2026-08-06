import { Mountain, TreePine, MapPin } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SVGProps } from "react";

export const ZONE_ICON_VALUES = ["mountain", "tree", "pin"] as const;
export type ZoneIconValue = (typeof ZONE_ICON_VALUES)[number];

const ICON_MAP: Record<ZoneIconValue, LucideIcon> = {
  mountain: Mountain,
  tree: TreePine,
  pin: MapPin,
};

function TwinPeaksIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="m2.5 18.5 6.2-9.4 3.1 4.3" />
      <path d="m9.8 18.5 5.5-11 6.2 11" />
      <path d="m13.5 11.1 1.8-3.6 2.2 3.9" />
    </svg>
  );
}

function ParkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M7 19v-4" />
      <path d="M4.3 15h5.4L7 10.7 4.3 15Z" />
      <path d="M4.8 11.7h4.4L7 8.2l-2.2 3.5Z" />
      <path d="M15.5 19v-5" />
      <path d="m11.7 14 3.8-6 3.8 6h-7.6Z" />
      <path d="M3 19h18" />
    </svg>
  );
}

function MountainCloudIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M7.5 9.5h7.2a2.3 2.3 0 0 0-.4-4.5 3.5 3.5 0 0 0-6.4 1.4 2 2 0 0 0-.4-.1 1.6 1.6 0 1 0 0 3.2Z" />
      <path d="m3 18 5-5 3.1 3.1 3.3-4.1 6.6 6" />
      <path d="M3 21h18" />
    </svg>
  );
}

const CANONICAL_ZONE_ICONS: Record<
  string,
  (props: SVGProps<SVGSVGElement>) => React.JSX.Element
> = {
  didveli: TwinPeaksIcon,
  centri: ParkIcon,
  kokhta: MountainCloudIcon,
};

export function ZoneIcon({
  icon,
  zoneSlug,
  className,
}: {
  icon: string;
  zoneSlug?: string;
  className?: string;
}) {
  const CanonicalIcon = zoneSlug ? CANONICAL_ZONE_ICONS[zoneSlug] : undefined;
  if (CanonicalIcon) return <CanonicalIcon className={className} />;
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
