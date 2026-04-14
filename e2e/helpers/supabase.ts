import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import type {
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
} from "../../src/lib/types/database";

dotenv.config({
  path: path.resolve(__dirname, "../../.env.local"),
  override: true,
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl,
  serviceRoleKey,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

type TableName = keyof Database["public"]["Tables"];

function tableHelper<T extends TableName>(table: T) {
  type Row = Tables<T>;
  type Insert = TablesInsert<T>;
  type Update = TablesUpdate<T>;

  return {
    async create(data: Insert): Promise<Row> {
      const { data: row, error } = await supabaseAdmin
        .from(table)
        .insert(data as never)
        .select()
        .single();
      if (error) throw new Error(`[${table}] insert failed: ${error.message}`);
      return row as unknown as Row;
    },
    async createMany(data: Insert[]): Promise<Row[]> {
      const { data: rows, error } = await supabaseAdmin
        .from(table)
        .insert(data as never)
        .select();
      if (error)
        throw new Error(`[${table}] insertMany failed: ${error.message}`);
      return rows as unknown as Row[];
    },
    async get(id: string): Promise<Row | null> {
      const pkColumn = table === "balances" ? "user_id" : "id";
      const { data: row, error } = await supabaseAdmin
        .from(table)
        .select()
        .eq(pkColumn, id)
        .single();
      if (error && error.code !== "PGRST116")
        throw new Error(`[${table}] get failed: ${error.message}`);
      return (row as unknown as Row) ?? null;
    },
    async getAll(): Promise<Row[]> {
      const { data: rows, error } = await supabaseAdmin.from(table).select();
      if (error) throw new Error(`[${table}] getAll failed: ${error.message}`);
      return rows as unknown as Row[];
    },
    async update(id: string, data: Update): Promise<Row> {
      const pkColumn = table === "balances" ? "user_id" : "id";
      const { data: rows, error } = await supabaseAdmin
        .from(table)
        .update(data as never)
        .eq(pkColumn, id)
        .select();
      if (error) throw new Error(`[${table}] update failed: ${error.message}`);
      if (!rows || rows.length === 0)
        throw new Error(`[${table}] update: no rows matched id=${id}`);
      return rows[0] as unknown as Row;
    },
    async delete(id: string): Promise<void> {
      const pkColumn = table === "balances" ? "user_id" : "id";
      const { error } = await supabaseAdmin
        .from(table)
        .delete()
        .eq(pkColumn, id);
      if (error) throw new Error(`[${table}] delete failed: ${error.message}`);
    },
    async deleteWhere(
      column: string,
      value: string | number | boolean,
    ): Promise<void> {
      const { error } = await supabaseAdmin
        .from(table)
        .delete()
        .eq(column, value);
      if (error)
        throw new Error(`[${table}] deleteWhere failed: ${error.message}`);
    },
  };
}

export const profiles = tableHelper("profiles");
export const properties = tableHelper("properties");
export const bookings = tableHelper("bookings");
export const calendarBlocks = tableHelper("calendar_blocks");
export const reviews = tableHelper("reviews");
export const services = tableHelper("services");
export const smartMatchRequests = tableHelper("smart_match_requests");
export const balances = tableHelper("balances");
export const transactions = tableHelper("transactions");
export const smsMessages = tableHelper("sms_messages");
export const notifications = tableHelper("notifications");
export const verifications = tableHelper("verifications");
export const blogPosts = tableHelper("blog_posts");
export const cleaningTasks = tableHelper("cleaning_tasks");
