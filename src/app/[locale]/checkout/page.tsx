import { Suspense } from "react";
import type { Metadata } from "next";
import CheckoutClient from "@/components/payments/CheckoutClient";

// Auth-gated sandbox checkout — keep it out of search indexes.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  // CheckoutClient reads `?session=` via useSearchParams, which requires a
  // Suspense boundary under the App Router.
  return (
    <Suspense>
      <CheckoutClient />
    </Suspense>
  );
}
