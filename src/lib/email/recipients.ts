// Who may be mailed at all (C33). Import-free so scripts/unit can load it
// straight from src/.
//
// Reserved top-level domains (RFC 2606 / RFC 6761) have no mail servers: a send
// to them always bounces, and bounces hurt the sending domain's reputation. The
// e2e fixtures register `@e2e.mybakuriani.test` accounts on staging, so with
// EMAIL_ALLOWED_RECIPIENTS="*" they would otherwise be mailed on every run.
export const RESERVED_TLDS = ["test", "example", "invalid", "localhost"];
const RESERVED = new Set(RESERVED_TLDS);

export function isReservedAddress(email: string): boolean {
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  return RESERVED.has(domain.slice(domain.lastIndexOf(".") + 1));
}

/** EMAIL_ALLOWED_RECIPIENTS: "all" only when it is explicitly "*". */
export function recipientAllowed(
  allowed: Set<string> | "all",
  email: string,
): boolean {
  return allowed === "all" || allowed.has(email.toLowerCase());
}
