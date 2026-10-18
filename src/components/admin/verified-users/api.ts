"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  financeRequest,
  type ApiFailure,
} from "@/components/admin/finance/api";
import { readJson } from "@/components/admin/statuses/shared";
import type {
  GroupInput,
  PickerUser,
  VerificationResult,
} from "@/lib/user-groups";

// Client side of the verified-users API (C52). Every route answers
// { error: <UserGroupErrorCode> } on failure and AdminVerifiedUsers.errors.<code>
// words it. Writes go through financeRequest (30 s timeout, code "network" for
// a lost connection); the picker's GET needs its own AbortSignal, which
// financeRequest cannot take, so it uses fetch + readJson.

export const VERIFIED_USERS_URL = "/api/admin/verified-users";
export const GROUPS_URL = `${VERIFIED_USERS_URL}/groups`;

/** Any profile, verified or not (the picker). [] below two characters. */
export async function searchUsers(
  term: string,
  signal: AbortSignal,
): Promise<PickerUser[]> {
  const res = await fetch(
    `${VERIFIED_USERS_URL}/search?q=${encodeURIComponent(term)}`,
    { cache: "no-store", signal },
  );
  const body = await readJson<{ results: PickerUser[] }>(res);
  return body.results;
}

/**
 * The shared toggle route (also used by the client page): true verifies, false
 * removes. changed:false means the account already was in that state. Its 404
 * is a missing account, which the group wording of not_found would misname.
 */
export async function setVerified(userId: string, verified: boolean) {
  const result = await financeRequest<VerificationResult>(
    `/api/admin/clients/${userId}/verified`,
    { method: "POST", json: { is_verified: verified } },
  );
  if (!result.ok && result.error.code === "not_found") {
    return {
      ok: false as const,
      error: { ...result.error, code: "unknown_user" },
    };
  }
  return result;
}

/** Create (no id) or replace a group's name, note, payer and members. */
export function saveGroup(input: GroupInput, groupId: string | null) {
  return financeRequest<{ id: string }>(
    groupId ? `${GROUPS_URL}/${groupId}` : GROUPS_URL,
    { method: groupId ? "PATCH" : "POST", json: input },
  );
}

export function deleteGroup(groupId: string) {
  return financeRequest<{ ok: true }>(`${GROUPS_URL}/${groupId}`, {
    method: "DELETE",
  });
}

/**
 * True when a write may have committed although it reported a failure: no
 * answer at all (timeout, lost connection) or a server error. A create is not
 * idempotent, so the form reloads the list before it allows another save.
 */
export function isUncertainFailure(error: ApiFailure): boolean {
  return error.status === 0 || error.status >= 500;
}

/** A translated message for an API error code (unknown codes: server_error). */
export function useVerifiedUsersErrorText() {
  const t = useTranslations("AdminVerifiedUsers");
  return useCallback(
    (code: string | null | undefined) =>
      code && t.has(`errors.${code}`)
        ? t(`errors.${code}`)
        : t("errors.server_error"),
    [t],
  );
}
