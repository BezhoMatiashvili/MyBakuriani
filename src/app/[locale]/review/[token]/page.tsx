import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

// Guest reviews are retired: the review page that SMS review links opened is
// gone. Links already sent land on the home page.
export default async function ReviewLinkRedirect() {
  redirect({ href: "/", locale: await getLocale() });
}
