import type { SupabaseClient } from "@supabase/supabase-js";

export type LeadStageValue =
  "new" | "contacted" | "shown" | "negotiating" | "closed";

export type LeadPriorityValue = "low" | "medium" | "high";

export interface LeadRow {
  id: string;
  owner_id: string;
  organization_id: string | null;
  property_id: string | null;
  client_name: string;
  client_phone: string | null;
  source: string | null;
  stage: LeadStageValue;
  priority: LeadPriorityValue;
  budget_min: number | null;
  budget_max: number | null;
  currency: string;
  note: string | null;
  next_action_at: string | null;
  interest_type: string | null;
  desired_location: string | null;
  created_at: string;
  updated_at: string;
  property?: { title: string } | null;
}

export interface LeadInsert {
  owner_id: string;
  organization_id?: string | null;
  client_name: string;
  client_phone?: string | null;
  property_id?: string | null;
  stage: LeadStageValue;
  priority: LeadPriorityValue;
  budget_min?: number | null;
  budget_max?: number | null;
  note?: string | null;
  interest_type?: string | null;
  desired_location?: string | null;
}

// The `leads` table is optional — created by migration 013_leads.sql.
// Until the migration is generated into the typed client, we need to loosen
// the typing on this one table so callers can still compile.
//
// The helper returns `unknown`-typed builder that behaves like the real
// PostgrestFilterBuilder (thenable + chainable). Callers narrow the return
// shape themselves where they consume it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LeadsBuilder = any;

export function leadsClient(client: SupabaseClient): {
  from: (table: "leads") => LeadsBuilder;
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return client as any;
}
