import type { ContentChangeTarget } from "@/lib/content-change/fields";

export type ContentChangeStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "withdrawn"
  | "superseded";

export type FieldDiff = Record<string, { before: unknown; after: unknown }>;

export interface ContentChangeRequest {
  id: string;
  requester_id: string;
  target_type: ContentChangeTarget;
  target_id: string;
  before_snapshot: Record<string, unknown>;
  proposed_values: Record<string, unknown>;
  field_diff: FieldDiff;
  status: ContentChangeStatus;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  withdrawn_at: string | null;
  created_at: string;
  updated_at: string;
}
