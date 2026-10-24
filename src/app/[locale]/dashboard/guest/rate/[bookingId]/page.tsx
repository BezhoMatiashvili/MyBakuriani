import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

// Guest reviews are retired: the "rate your stay" page is gone. Old
// notification links land on the guest home page.
export default async function GuestRateRedirect() {
  redirect({ href: "/dashboard/guest", locale: await getLocale() });
}
