import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import {
  SMART_MATCH_NEW_PARAM,
  SMART_MATCH_NEW_VALUE,
} from "@/lib/signup-links";
import { loadGuestData } from "./loadData";
import GuestDashboardClient from "./GuestDashboardClient";

export default async function GuestDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login");
  }

  const supabase = await createClient();
  const [initial, params] = await Promise.all([
    loadGuestData(supabase, user.id),
    searchParams,
  ]);

  return (
    <GuestDashboardClient
      userId={user.id}
      initial={initial}
      openNewRequest={params[SMART_MATCH_NEW_PARAM] === SMART_MATCH_NEW_VALUE}
    />
  );
}
