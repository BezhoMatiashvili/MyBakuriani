import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

// The admin "შეფასებების მოდერაცია" page is retired (reviews and ratings were
// removed from the whole site). Old bookmarks land on the admin home page.
export default async function AdminReviewsRedirect() {
  redirect({ href: "/dashboard/admin", locale: await getLocale() });
}
