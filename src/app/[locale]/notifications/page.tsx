import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import NotificationsInbox from "./NotificationsInbox";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");
  return <NotificationsInbox userId={user.id} />;
}
