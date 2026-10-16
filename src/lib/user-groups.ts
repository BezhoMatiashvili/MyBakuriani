/**
 * Admin "Verified Users" and user groups (contract C52). Pure: no `@/`
 * imports, no enums, no parameter properties, so scripts/unit/user-groups.test.mjs
 * and scripts/check-db-contracts.mjs load it with `node --experimental-strip-types`.
 *
 * A group links ONE payer to the users they paid for. The limits below equal
 * the CHECKs and the RPC's caps in the migration (scripts/unit compares them),
 * and the error codes are the keys of AdminVerifiedUsers.errors.<code>.
 */

export const USER_GROUP_ROLES = ["payer", "member"] as const;
export type UserGroupRole = (typeof USER_GROUP_ROLES)[number];

export const USER_GROUP_NAME_MAX = 120; // = user_groups_name_check
export const USER_GROUP_NOTE_MAX = 1000; // = user_groups_note_check
export const USER_GROUP_MAX_MEMBERS = 100; // members besides the payer = the RPC's cardinality cap
export const VERIFIED_USERS_PAGE_SIZE = 50;
export const USER_SEARCH_LIMIT = 15;
export const USER_SEARCH_MIN_CHARS = 2;

const SEARCH_MAX_CHARS = 100;

export const USER_GROUP_ERROR_CODES = [
  "invalid_input",
  "invalid_id",
  "name_required",
  "name_too_long",
  "note_too_long",
  "payer_required",
  "payer_in_members",
  "members_required",
  "too_many_members",
  "unknown_user",
  "not_found",
  "forbidden",
  "unauthenticated",
  "busy",
  "server_error",
] as const;
export type UserGroupErrorCode = (typeof USER_GROUP_ERROR_CODES)[number];

// Any hex uuid, any version/variant: the e2e and QA seed ids (aae2ff00-0000-...)
// are not RFC 4122 v4, and Postgres accepts them. Same shape as
// src/lib/admin-statuses.ts:isUuid, copied because this module may not import.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Length in Unicode code points, as the database's char_length counts. */
function codePoints(value: string): number {
  return Array.from(value).length;
}

export type GroupInput = {
  name: string;
  note: string | null;
  payerId: string;
  memberIds: string[];
};

// Bidi controls (Unicode Bidi_Control: marks, embeddings, overrides, isolates).
// A right-to-left override typed into a name or note would reorder the page
// that shows it, so they are removed, and before whitespace collapses.
const BIDI_CONTROLS = /\p{Bidi_C}/gu;
// Whitespace runs of any kind, C0/C1 controls (a pasted newline or tab), the
// zero-width space and the word joiner collapse to one space. ZWJ/ZWNJ stay:
// a family emoji and a Persian word are one piece.
const NAME_BREAKS = /[\s\p{Cc}\u200B\u2060]+/gu;
// A lone UTF-16 surrogate (text cut inside an emoji) is valid in JavaScript but
// not in JSON or Postgres text: it would come back from the database as a 22P02
// and surface as a 500, so it goes like any other unprintable character. With
// the u flag a valid pair is one code point and never matches.
const LONE_SURROGATE = /\p{Cs}/gu;
// C0 and C1 controls except tab, line feed and carriage return (a NUL would
// make Postgres refuse the whole statement).
const NOTE_CONTROLS = /(?![\t\n\r])\p{Cc}/gu;
// At least one character a person can see: not whitespace, a control or a
// format character (zero-width space and joiners, bidi controls, soft hyphen).
const VISIBLE = /[^\s\p{Cc}\p{Cf}]/u;

type Fail = { ok: false; error: UserGroupErrorCode };
const fail = (error: UserGroupErrorCode): Fail => ({ ok: false, error });

/**
 * Validates a create/edit body. The checks run in the RPC's order
 * (admin_save_user_group): name, note, payer, then the member list.
 * A body that is not an object or has a field of the wrong JSON type is
 * invalid_input; a missing, null or blank field is that field's *_required.
 * Blank means nothing visible is left after cleaning: only whitespace,
 * controls, zero-width or bidi characters (bidi controls are removed, ZWJ and
 * ZWNJ kept); a blank note is null. Lengths are code points, as char_length.
 * Ids are lowercased so the de-duplication and the payer test are exact.
 */
export function parseGroupInput(
  body: unknown,
): { ok: true; value: GroupInput } | Fail {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return fail("invalid_input");
  }
  const raw = body as Record<string, unknown>;

  if (
    raw.name !== undefined &&
    raw.name !== null &&
    typeof raw.name !== "string"
  ) {
    return fail("invalid_input");
  }
  const name = (raw.name ?? "")
    .toString()
    .replace(LONE_SURROGATE, "")
    .replace(BIDI_CONTROLS, "")
    .replace(NAME_BREAKS, " ")
    .trim();
  if (!VISIBLE.test(name)) return fail("name_required");
  if (codePoints(name) > USER_GROUP_NAME_MAX) return fail("name_too_long");

  if (
    raw.note !== undefined &&
    raw.note !== null &&
    typeof raw.note !== "string"
  ) {
    return fail("invalid_input");
  }
  const noteText = (raw.note ?? "")
    .toString()
    .replace(LONE_SURROGATE, "")
    .replace(NOTE_CONTROLS, "")
    .replace(BIDI_CONTROLS, "")
    .trim();
  // A note with nothing visible is no note, however much invisible text it has.
  const note = VISIBLE.test(noteText) ? noteText : null;
  if (note !== null && codePoints(note) > USER_GROUP_NOTE_MAX)
    return fail("note_too_long");

  if (!isUuid(raw.payerId)) return fail("payer_required");
  const payerId = raw.payerId.toLowerCase();

  if (
    raw.memberIds !== undefined &&
    raw.memberIds !== null &&
    !Array.isArray(raw.memberIds)
  ) {
    return fail("invalid_input");
  }
  const memberIds: string[] = [];
  const seen = new Set<string>();
  for (const entry of (raw.memberIds ?? []) as unknown[]) {
    if (!isUuid(entry)) return fail("invalid_input");
    const id = entry.toLowerCase();
    if (!seen.has(id)) {
      seen.add(id);
      memberIds.push(id);
    }
  }
  if (seen.has(payerId)) return fail("payer_in_members");
  if (memberIds.length === 0) return fail("members_required");
  if (memberIds.length > USER_GROUP_MAX_MEMBERS)
    return fail("too_many_members");

  return { ok: true, value: { name, note, payerId, memberIds } };
}

// The HINT of ADMIN_USER_GROUP_INVALID is the failed check's own error code
// (the migration raises exactly these seven), so the map is the identity; a
// hint it does not list, or none, stays a plain invalid_input.
const INVALID_HINTS: Record<string, UserGroupErrorCode> = {
  name_required: "name_required",
  name_too_long: "name_too_long",
  note_too_long: "note_too_long",
  payer_required: "payer_required",
  payer_in_members: "payer_in_members",
  members_required: "members_required",
  too_many_members: "too_many_members",
};

/**
 * The request error an admin_save_user_group exception carries, or null when
 * the error is not one of its tokens (the caller then logs it and answers
 * server_error). PostgREST puts RAISE's message in `message` and USING HINT in
 * `hint`; the status here is the route's answer, whatever the SQLSTATE.
 */
export function groupRpcErrorCode(
  error: { message?: string | null; hint?: string | null } | null | undefined,
): { code: UserGroupErrorCode; status: number } | null {
  const token = /ADMIN_USER_GROUP_[A-Z_]+/.exec(
    typeof error?.message === "string" ? error.message : "",
  )?.[0];
  switch (token) {
    case "ADMIN_USER_GROUP_FORBIDDEN":
      return { code: "forbidden", status: 403 };
    case "ADMIN_USER_GROUP_INVALID": {
      const hint = typeof error?.hint === "string" ? error.hint.trim() : "";
      return {
        code: Object.hasOwn(INVALID_HINTS, hint)
          ? INVALID_HINTS[hint]
          : "invalid_input",
        status: 400,
      };
    }
    case "ADMIN_USER_GROUP_UNKNOWN_USER":
      return { code: "unknown_user", status: 400 };
    case "ADMIN_USER_GROUP_NOT_FOUND":
      return { code: "not_found", status: 404 };
    default:
      return null;
  }
}

/**
 * The profile columns the verified toggle writes. A transition to verified
 * stamps the date, a transition away clears it; the route applies it only to
 * rows that really change, so a repeat keeps the original date.
 */
export function verificationPatch(
  verified: boolean,
  nowIso: string,
): { is_verified: boolean; verified_at: string | null } {
  return { is_verified: verified, verified_at: verified ? nowIso : null };
}

// Characters that would change the structure of a PostgREST .or() filter
// string (, ( ) " \), act as LIKE wildcards in a pattern the caller builds
// from the term (% and *), or are control characters. A plain "_" stays: it
// matches one character, so the search can only get wider, never narrower.
const SEARCH_STRIPPED = /[,()"\\%*\p{Cc}]/gu;

/**
 * A free-text search term that is safe to interpolate into
 * `column.ilike.*<term>*`: stripped characters become spaces, runs of
 * whitespace collapse, at most 100 code points. A lone surrogate is dropped
 * too (encodeURIComponent throws on one, and the picker puts the term in a URL).
 * Running it again changes nothing.
 */
export function normalizeSearchTerm(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";
  return Array.from(
    raw
      .replace(LONE_SURROGATE, "")
      .replace(SEARCH_STRIPPED, " ")
      .replace(/\s+/gu, " ")
      .trim(),
  )
    .slice(0, SEARCH_MAX_CHARS)
    .join("")
    .trim();
}

/**
 * Avatar fallback: the first code point of the first two words. Latin letters
 * are upper-cased; Georgian (which has no case, and whose Mtavruli capitals
 * are a different alphabet) and every other script are left alone.
 */
export function initialsOf(name: string | null | undefined): string {
  const words = (typeof name === "string" ? name : "")
    .split(/\s+/u)
    .filter((word) => word !== "")
    .slice(0, 2);
  return words
    .map((word) => {
      const first = Array.from(word)[0];
      if (!/^\p{Script=Latin}$/u.test(first)) return first;
      const upper = first.toUpperCase();
      return Array.from(upper).length === 1 ? upper : first;
    })
    .join("");
}

/** The account ID the dashboards show (DashboardShell's MB-XXXXX chip). */
export function shortUserCode(id: string): string {
  return `MB-${id.replace(/-/g, "").slice(0, 5).toUpperCase()}`;
}

// ---- API payload types (the wire contract) ----

export type PickerUser = {
  id: string;
  display_name: string;
  phone: string | null;
  avatar_url: string | null;
  role: string;
  is_verified: boolean;
  created_at: string | null;
};
export type UserGroupMembership = {
  group_id: string;
  group_name: string;
  role: UserGroupRole;
};
export type VerifiedUserRow = {
  id: string;
  display_name: string;
  phone: string | null;
  avatar_url: string | null;
  role: string;
  verified_at: string | null;
  created_at: string | null;
  groups: UserGroupMembership[];
};
export type VerifiedUsersPayload = {
  rows: VerifiedUserRow[];
  count: number;
  total: number;
  page: number;
  pageSize: number;
};
export type UserGroupRow = {
  id: string;
  name: string;
  note: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  payer: PickerUser | null; // null only if the payer's account was deleted
  members: PickerUser[]; // everybody except the payer
};
export type UserGroupsPayload = { groups: UserGroupRow[]; count: number };
export type VerificationResult = {
  ok: true;
  changed: boolean;
  is_verified: boolean;
  verified_at: string | null;
};

// ---- the group form's draft (pure, never mutates its arguments) ----

export type GroupDraft = { payer: PickerUser | null; members: PickerUser[] };
export type MemberPickReason = "isPayer" | "alreadyAdded" | "limitReached";

// Ids are compared in lower case, like parseGroupInput stores them.
const sameId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** A saved group as the form starts from it (the payer is null if deleted). */
export function groupToDraft(group: UserGroupRow): GroupDraft {
  return { payer: group.payer, members: [...group.members] };
}

/** Why this user cannot be added as a member now, or null when they can. */
export function memberPickReason(
  draft: GroupDraft,
  userId: string,
): MemberPickReason | null {
  if (draft.payer && sameId(draft.payer.id, userId)) return "isPayer";
  if (draft.members.some((member) => sameId(member.id, userId))) {
    return "alreadyAdded";
  }
  if (draft.members.length >= USER_GROUP_MAX_MEMBERS) return "limitReached";
  return null;
}

/**
 * The user becomes the payer and leaves the members if they were one. The
 * previous payer is simply gone, not added as a member: the admin decides.
 */
export function pickPayer(draft: GroupDraft, user: PickerUser): GroupDraft {
  return {
    payer: user,
    members: draft.members.filter((member) => !sameId(member.id, user.id)),
  };
}

/** Adds a member at the top (newest first), or says why it cannot. */
export function addMember(
  draft: GroupDraft,
  user: PickerUser,
): { ok: true; draft: GroupDraft } | { ok: false; reason: MemberPickReason } {
  const reason = memberPickReason(draft, user.id);
  if (reason) return { ok: false, reason };
  return {
    ok: true,
    draft: { payer: draft.payer, members: [user, ...draft.members] },
  };
}

export function removeMember(draft: GroupDraft, userId: string): GroupDraft {
  return {
    payer: draft.payer,
    members: draft.members.filter((member) => !sameId(member.id, userId)),
  };
}
