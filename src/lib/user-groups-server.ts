import "server-only";
import { json, searchOp, type Op } from "@/lib/admin-statuses-server";
import { isTimeoutError } from "@/lib/with-timeout";
import type { Tables } from "@/lib/types/database";
import {
  VERIFIED_USERS_PAGE_SIZE,
  groupRpcErrorCode,
  isUuid,
  normalizeSearchTerm,
  type PickerUser,
  type UserGroupErrorCode,
} from "@/lib/user-groups";

// Shared plumbing of /api/admin/verified-users/** (C52): errors in the
// UserGroupErrorCode vocabulary, the user search filter, paging and the row
// transforms. json/readPage/applyOps/searchOp come from
// admin-statuses-server (C44); errorResponse and pageRange cannot be reused
// there (typed to the statuses vocabulary and page size).

export const PICKER_COLUMNS =
  "id, display_name, phone, avatar_url, role, is_verified, created_at";

const STATUS: Partial<Record<UserGroupErrorCode, number>> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  busy: 503,
  server_error: 500,
};

export function errorResponse(
  code: UserGroupErrorCode,
  status?: number,
): Response {
  return json({ error: code }, status ?? STATUS[code] ?? 400);
}

type DbError = {
  code?: string | null;
  message?: string | null;
  hint?: string | null;
};

/**
 * A failed query or RPC as a response: the RPC's own tokens first, then
 * "busy" for a lock wait, a statement timeout, PostgREST's connection / pool
 * errors (PGRST000-003) or our fetch timeout (the statement may still have
 * committed: the UI reloads), else log + 500. The raw database message never
 * reaches the browser, and the log gets code, message and hint only: a CHECK
 * violation's `details` holds the failing row (a group's name and note).
 */
export function dbFailure(
  error: DbError,
  label: string,
  status?: number,
): Response {
  const mapped = groupRpcErrorCode(error);
  if (mapped) return errorResponse(mapped.code, mapped.status);
  // Cloudflare, in front of Supabase, answers an HTML page where PostgREST
  // would answer JSON; supabase-js puts the whole page into error.message. A
  // 403 is its firewall refusing a query string that looks like SQL injection
  // ("'; drop table x; --" in a search box): the input is at fault. Any other
  // page is the gateway failing, and a write may have committed behind it.
  if (!error.code && /^\s*<(?:!doctype|html)/i.test(error.message ?? "")) {
    if (status === 403) {
      console.warn(`[verified-users] ${label} blocked by the edge firewall`);
      return errorResponse("invalid_input");
    }
    console.error(`[verified-users] ${label} answered an HTML page`, {
      status,
    });
    return errorResponse(
      status === 429 || (status ?? 0) >= 500 ? "busy" : "server_error",
    );
  }
  if (
    error.code === "55P03" ||
    error.code === "57014" ||
    /^PGRST00[0-3]$/.test(error.code ?? "") ||
    isTimeoutError(error)
  ) {
    return errorResponse("busy");
  }
  console.error(`[verified-users] ${label} failed`, {
    code: error.code,
    message: error.message,
    hint: error.hint,
  });
  return errorResponse("server_error");
}

/** 0-based inclusive range of a 1-based page (not admin-statuses' size). */
export function pageRange(page: number): [number, number] {
  const from = (page - 1) * VERIFIED_USERS_PAGE_SIZE;
  return [from, from + VERIFIED_USERS_PAGE_SIZE - 1];
}

/**
 * The search over profiles for a free-text term: name or phone contains it, a
 * pasted uuid matches the id, and 4+ typed digits match the stored +995…
 * number whatever spaces or plus the admin typed. The term is normalised here
 * (again, if the caller did), so no caller can put a raw string into the
 * or=(...) filter.
 */
export function userSearchOps(raw: string): Op[] {
  const term = normalizeSearchTerm(raw);
  if (!term) return [];
  const extra: string[] = [];
  if (isUuid(term)) extra.push(`id.eq.${term}`);
  const digits = term.replace(/\D/g, "");
  if (digits.length >= 4 && digits !== term) {
    extra.push(`phone.ilike.*${digits}*`);
  }
  return searchOp(term, ["display_name", "phone"], extra);
}

type ProfileRow = Pick<
  Tables<"profiles">,
  | "id"
  | "display_name"
  | "phone"
  | "avatar_url"
  | "role"
  | "is_verified"
  | "created_at"
>;

/** phone, avatar and created_at are nullable; is_verified is nullable too. */
export function toPickerUser(p: ProfileRow): PickerUser {
  return {
    id: p.id,
    display_name: p.display_name,
    phone: p.phone ?? null,
    avatar_url: p.avatar_url ?? null,
    role: p.role,
    is_verified: p.is_verified === true,
    created_at: p.created_at ?? null,
  };
}

/** Name order for people (Georgian and Latin together), id as the tiebreak. */
export function byName(
  a: { display_name: string; id: string },
  b: { display_name: string; id: string },
): number {
  return (
    a.display_name.localeCompare(b.display_name, "ka") ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}
