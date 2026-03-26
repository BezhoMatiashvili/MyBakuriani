import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Check if user has a profile to determine redirect
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (!profile) {
          // New user — send to registration
          return NextResponse.redirect(`${origin}/auth/register`);
        }

        // Existing user — redirect based on role
        const rolePaths: Record<string, string> = {
          admin: "/dashboard/admin",
          renter: "/dashboard/renter",
          seller: "/dashboard/seller",
          cleaner: "/dashboard/cleaner",
          food: "/dashboard/food",
          entertainment: "/dashboard/service",
          transport: "/dashboard/service",
          employment: "/dashboard/service",
          handyman: "/dashboard/service",
        };
        const dashboardPath = rolePaths[profile.role] ?? "/dashboard/guest";
        return NextResponse.redirect(
          `${origin}${next === "/dashboard" ? dashboardPath : next}`,
        );
      }
    }
  }

  // Auth error — redirect to login
  return NextResponse.redirect(`${origin}/auth/login`);
}
