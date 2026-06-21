import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isAdminViewer } from "@/lib/auth/is-admin-viewer";
import { getMockProperty, isMockPropertyId } from "@/lib/mock/properties";
import type { Tables } from "@/lib/types/database";

type PropertyWithProfile = Tables<"properties"> & {
  profiles: Tables<"profiles"> | null;
};

// cache(): generateMetadata + page body share one query per request.
export const getPropertyById = cache(
  async (
    id: string,
  ): Promise<{
    data: PropertyWithProfile | null;
    isMock: boolean;
  }> => {
    if (isMockPropertyId(id)) {
      return { data: getMockProperty(id), isMock: true };
    }

    try {
      const adminViewer = await isAdminViewer();
      // Admins preview pending listings: the service-role client bypasses RLS,
      // which the anonymous public client cannot (it would still hide non-active rows).
      const supabase = adminViewer
        ? createServiceClient()
        : createPublicClient();
      let query = supabase
        .from("properties")
        .select("*, profiles!properties_owner_id_fkey(*)")
        .eq("id", id);
      if (!adminViewer) {
        query = query.eq("status", "active");
      }
      const { data } = await query.single();

      return { data: (data as PropertyWithProfile) ?? null, isMock: false };
    } catch {
      return { data: null, isMock: false };
    }
  },
);

export type PropertyMetadata = {
  title: string;
  location: string;
  description: string | null;
  photos: string[] | null;
};

export async function getPropertyMetadataById(
  id: string,
): Promise<PropertyMetadata | null> {
  // Reuses the request-cached full fetch — no separate metadata query.
  const { data } = await getPropertyById(id);
  if (!data) return null;
  return {
    title: data.title,
    location: data.location,
    description: data.description,
    photos: data.photos,
  };
}
