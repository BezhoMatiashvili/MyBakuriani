import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

// The guest "ჯავშნები" tab (the Smart Match offers inbox) is retired; offers
// are shown on the guest home page. Old bookmarks land there.
export default async function GuestBookingsRedirect() {
  redirect({ href: "/dashboard/guest", locale: await getLocale() });
}
