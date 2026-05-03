import { createPublicClient } from "@/lib/supabase/server";
import {
  getMockService,
  isMockServiceId,
  type ServiceWithFoodExtras,
} from "@/lib/mock/services";
import type { Tables } from "@/lib/types/database";

export async function getServiceById(id: string): Promise<{
  data: ServiceWithFoodExtras | null;
  isMock: boolean;
}> {
  if (isMockServiceId(id)) {
    return { data: getMockService(id), isMock: true };
  }

  try {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("services")
      .select("*, profiles!services_owner_id_fkey(*)")
      .eq("id", id)
      .eq("status", "active")
      .single();

    return { data: (data as ServiceWithFoodExtras) ?? null, isMock: false };
  } catch {
    return { data: null, isMock: false };
  }
}

export type ServiceMetadata = {
  title: string;
  description: string | null;
  category: Tables<"services">["category"];
  route?: string | null;
};

export async function getServiceMetadataById(
  id: string,
): Promise<ServiceMetadata | null> {
  if (isMockServiceId(id)) {
    const mock = getMockService(id);
    if (!mock) return null;
    return {
      title: mock.title,
      description: mock.description,
      category: mock.category,
      route: mock.route,
    };
  }

  try {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("services")
      .select("title, description, category, route")
      .eq("id", id)
      .single();
    if (!data) return null;
    return data;
  } catch {
    return null;
  }
}
