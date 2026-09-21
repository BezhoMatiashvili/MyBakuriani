/**
 * Application-facing Supabase types.
 *
 * `database.generated.ts` is the raw `supabase gen types` output and is never
 * edited by hand (contract C3). This file is the ONLY place hand-written
 * adjustments live, and every one of them is a deliberate, documented rule
 * layered on top of the generated `Database` — not a per-column patch.
 *
 * Two adjustments exist:
 *
 * 1. Public views keep their legacy listing shapes. Postgres drops NOT NULL
 *    from view columns, so the generator types every view column nullable and
 *    omits the base-table typing the app relies on. The SQL views are the
 *    security boundary (allow-listed columns, no owner/contact/moderation
 *    fields); the types below describe how the app consumes them. Making
 *    these truthful (view Row ≠ table Row) is a tracked follow-up.
 *
 * 2. RPC arguments with a SQL DEFAULT accept an explicit `null`. PostgREST
 *    treats `p_x: null` and an omitted `p_x` identically for DEFAULT NULL
 *    params, and several RPCs use non-null sentinels (e.g. `-1` = "unchanged")
 *    where an explicit null is the only way to say "clear". The generator only
 *    emits `?:`, so `NullableOptionalArgs` widens every optional arg to
 *    `T | null | undefined`.
 */
import type { Database as GeneratedDatabase, Json } from "./database.generated";

export type { Json };
export { Constants } from "./database.generated";

type GenPublic = GeneratedDatabase["public"];
type Row<T extends keyof GenPublic["Tables"]> = GenPublic["Tables"][T]["Row"];

// ---------------------------------------------------------------------------
// 1. Public view overrides
// ---------------------------------------------------------------------------
type PublicViews = {
  public_properties: {
    Row: Row<"properties"> & { has_whatsapp: boolean };
    Relationships: [];
  };
  public_services: {
    Row: Row<"services"> & {
      has_whatsapp: boolean;
      has_active_discount: boolean;
      best_active_menu_item_discount_percent: number | null;
      profile_is_verified: boolean | null;
    };
    Relationships: [];
  };
  public_service_menu_items: {
    Row: Row<"service_menu_items"> & { has_active_discount: boolean };
    Relationships: [];
  };
  public_listing_profiles: { Row: Row<"profiles">; Relationships: [] };
  public_organizations: { Row: Row<"organizations">; Relationships: [] };
  public_reviews: { Row: Row<"reviews">; Relationships: [] };
};

// Compile-time tripwire: every view the generator knows about must be
// covered here, and vice versa, so a new/dropped SQL view shows up as a type
// error instead of silently falling back to the all-nullable generated shape.
type _ViewParity = [
  Exclude<keyof GenPublic["Views"], keyof PublicViews>,
  Exclude<keyof PublicViews, keyof GenPublic["Views"]>,
] extends [never, never]
  ? true
  : never;
const _viewParity: _ViewParity = true;
void _viewParity;

// ---------------------------------------------------------------------------
// 2. Null-tolerant optional RPC arguments
// ---------------------------------------------------------------------------
type NullableOptionalArgs<A> = {
  [K in keyof A]: undefined extends A[K] ? A[K] | null : A[K];
};
type RelaxedFunctions = {
  [F in keyof GenPublic["Functions"]]: Omit<
    GenPublic["Functions"][F],
    "Args"
  > & {
    Args: NullableOptionalArgs<GenPublic["Functions"][F]["Args"]>;
  };
};

// ---------------------------------------------------------------------------
// Merged Database consumed by every createClient<Database>()
// ---------------------------------------------------------------------------
export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GenPublic, "Views" | "Functions"> & {
    Views: PublicViews;
    Functions: RelaxedFunctions;
  };
};

// ---------------------------------------------------------------------------
// Helper types (verbatim from the generator, re-pointed at the merged
// Database so `Tables<"public_properties">` sees the overrides above).
// ---------------------------------------------------------------------------
type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;
