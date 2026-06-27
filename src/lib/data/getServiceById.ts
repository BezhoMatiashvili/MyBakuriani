import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { createClient, createPublicClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isAdminViewer } from "@/lib/auth/is-admin-viewer";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getMockService,
  isMockServiceId,
  type ServiceWithFoodExtras,
} from "@/lib/mock/services";
import { isUuid } from "@/lib/utils/uuid";
import { sanitizePhotos } from "@/lib/utils/photos";
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

    // Reject malformed ids before querying: a non-uuid in the uuid `id` column
    // raises "invalid input syntax for type uuid" (a flood from crawlers/old URLs).
    if (!isUuid(id)) {
      return { data: null, isMock: false };
    }

    try {
      const adminViewer = await isAdminViewer();
      // Request-memoized; isAdminViewer() already resolved it, so this is free.
      const user = await getCurrentUser();
      // Three-tier viewer model:
      //  - admin: service-role bypasses RLS (services have no admin RLS override).
      //  - signed-in user: the authenticated SSR client carries their cookies, so
      //    auth.uid() resolves and RLS (status='active' OR owner_id=auth.uid()) lets
      //    a creator read their own pending listing — without it the anon client
      //    sends no cookie and the owner branch can never match.
      //  - anonymous: the public client sees only active rows via RLS.
      const supabase = adminViewer
        ? createServiceClient()
        : user
          ? await createClient()
          : createPublicClient();
      const { data } = await supabase
        .from("services")
        .select("*, profiles!services_owner_id_fkey(*)")
        .eq("id", id)
        .maybeSingle();

      const row = (data as ServiceWithFoodExtras) ?? null;
      if (!row) return { data: null, isMock: false };
      // Defense in depth: a non-active row is only returned to its owner or an
      // admin (RLS already enforces this for the anon/authenticated clients).
      if (
        row.status !== "active" &&
        !adminViewer &&
        row.owner_id !== user?.id
      ) {
        return { data: null, isMock: false };
      }
      // Drop legacy base64/oversized photo entries before they reach SSR HTML,
      // the RSC payload, or og:image — see sanitizePhotos.
      row.photos = sanitizePhotos(row.photos);
      return { data: row, isMock: false };
    } catch (err) {
      // Never swallow Next's control-flow signals (dynamic-rendering bail-out,
      // redirect, notFound) — doing so corrupts the render. Only real query
      // failures fall through to a null (not-found) result.
      unstable_rethrow(err);
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
