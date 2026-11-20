import { gaMeasurementIdFrom } from "./measurement-id";

// The only reader of NEXT_PUBLIC_GA_MEASUREMENT_ID (C62). Inlined at build
// time: unset (or not a G- ID) = no Google Analytics, no banner or privacy
// change at all.
export const GA_MEASUREMENT_ID = gaMeasurementIdFrom(
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
);
