import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

// The renter "შეფასებები" page is retired (reviews and ratings were removed
// from the whole site). Old bookmarks land on the renter home page.
export default async function RenterReviewsRedirect() {
  redirect({ href: "/dashboard/renter", locale: await getLocale() });
}
