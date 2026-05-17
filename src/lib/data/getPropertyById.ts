import { createPublicClient } from "@/lib/supabase/server";
import { isAdminViewer } from "@/lib/auth/is-admin-viewer";
import { getMockProperty, isMockPropertyId } from "@/lib/mock/properties";
import type { Tables } from "@/lib/types/database";

type PropertyWithProfile = Tables<"properties"> & {
  profiles: Tables<"profiles"> | null;
};

export async function getPropertyById(id: string): Promise<{
  data: PropertyWithProfile | null;
  isMock: boolean;
}> {
  if (isMockPropertyId(id)) {
    return { data: getMockProperty(id), isMock: true };
  }

  try {
    const supabase = createPublicClient();
    const adminViewer = await isAdminViewer();
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
}

export type PropertyMetadata = {
  title: string;
  location: string;
  description: string | null;
};

export async function getPropertyMetadataById(
  id: string,
): Promise<PropertyMetadata | null> {
  if (isMockPropertyId(id)) {
    const mock = getMockProperty(id);
    if (!mock) return null;
    return {
      title: mock.title,
      location: mock.location,
      description: mock.description,
    };
  }

  try {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("properties")
      .select("title, location, description")
      .eq("id", id)
      .single();
    if (!data) return null;
    return data;
  } catch {
    return null;
  }
}
