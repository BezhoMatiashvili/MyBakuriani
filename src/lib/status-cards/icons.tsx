import {
  Thermometer,
  Cloud,
  Snowflake,
  Mountain,
  CableCar,
  Car,
  Route,
  Video,
  Camera,
  Sun,
  CloudSun,
  CloudRain,
  CloudSnow,
  CloudFog,
  CloudLightning,
  type LucideIcon,
} from "lucide-react";
import type { StatusIcon } from "./types";

// Maps the whitelisted icon keys to lucide components. "none" → no icon.
export const ICON_MAP: Record<StatusIcon, LucideIcon | null> = {
  none: null,
  thermometer: Thermometer,
  cloud: Cloud,
  snowflake: Snowflake,
  mountain: Mountain,
  cableCar: CableCar,
  car: Car,
  route: Route,
  video: Video,
  camera: Camera,
  sun: Sun,
  cloudSun: CloudSun,
  cloudRain: CloudRain,
  cloudSnow: CloudSnow,
  cloudFog: CloudFog,
  cloudLightning: CloudLightning,
};
