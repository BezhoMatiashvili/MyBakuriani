import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isAdminViewer } from "@/lib/auth/is-admin-viewer";
import {
  getMockService,
  isMockServiceId,
  type ServiceWithFoodExtras,
} from "@/lib/mock/services";
import type { Tables } from "@/lib/types/database";

// cache(): generateMetadata + page body share one query per request.
export const getServiceById = cache(
  async (
    id: string,
  ): Promise<{
    data: ServiceWithFoodExtras | null;
    isMock: boolean;
  }> => {
    if (isMockServiceId(id)) {
      return { data: getMockService(id), isMock: true };
    }

    try {
      const adminViewer = await isAdminViewer();
      // Admins preview pending listings: the service-role client bypasses RLS.
      // Services have no admin RLS override, so this is the only path that works.
      const supabase = adminViewer
        ? createServiceClient()
        : createPublicClient();
      let query = supabase
        .from("services")
        .select("*, profiles!services_owner_id_fkey(*)")
        .eq("id", id);
      if (!adminViewer) {
        query = query.eq("status", "active");
      }
      const { data } = await query.single();

      return { data: (data as ServiceWithFoodExtras) ?? null, isMock: false };
    } catch {
      return { data: null, isMock: false };
    }
  },
);

export type ServiceMetadata = {
  title: string;
  description: string | null;
  category: Tables<"services">["category"];
  route?: string | null;
  photos: string[] | null;
};

export async function getServiceMetadataById(
  id: string,
): Promise<ServiceMetadata | null> {
  // Reuses the request-cached full fetch — no separate metadata query.
  const { data } = await getServiceById(id);
  if (!data) return null;
  return {
    title: data.title,
    description: data.description,
    category: data.category,
    route: data.route,
    photos: data.photos,
  };
}
