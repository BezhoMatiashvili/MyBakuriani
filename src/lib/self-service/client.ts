export type NotificationPrefs = Partial<{
  new_request: boolean;
  add_favorite: boolean;
  monthly_report: boolean;
}>;

export type SelfServiceProfileValues = {
  display_name?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  profile_type?: "personal" | "company";
  personal_id?: string | null;
  whatsapp_enabled?: boolean;
  notification_prefs?: NotificationPrefs;
  marketing_opt_out?: boolean;
  cleaner_profile?: Partial<{
    first_name: string | null;
    last_name: string | null;
    personal_number: string | null;
    address: string | null;
    phone: string | null;
    whatsapp: string | null;
  }>;
};

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => null)) as T & { error?: string };
  if (!response.ok) throw new Error(body?.error ?? "self_service_failed");
  return body;
}

export async function updateSelfServiceProfile(values: SelfServiceProfileValues) {
  return request<{
    profile: Record<string, unknown>;
    cleaner_profile: Record<string, unknown> | null;
  }>("/api/self-service/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(values),
  });
}

export async function publishPropertyProgress(
  propertyId: string,
  values: {
    stages: string[];
    status?: string | null;
    note?: string | null;
    photos?: string[];
    videoUrl?: string | null;
    updateDate?: string;
  },
) {
  return request<{
    property: Record<string, unknown>;
    project_update: Record<string, unknown>;
  }>(`/api/self-service/properties/${propertyId}/progress`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(values),
  });
}

export type CleanerWorkingHoursService = {
  id: string;
  title: string;
  provider_name: string | null;
  schedule: string | null;
  operating_hours: string | null;
};

export async function updateCleanerWorkingHours(
  serviceId: string,
  values: { is24_7: boolean; workingHours: string },
) {
  return request<{ services: CleanerWorkingHoursService[] }>(
    `/api/self-service/cleaner/services/${serviceId}/working-hours`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    },
  );
}
