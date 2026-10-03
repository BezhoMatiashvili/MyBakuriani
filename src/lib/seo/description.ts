// Which text becomes a listing page's meta description (C40). Pure and
// self-contained (no `@/`, no sibling imports) so scripts/unit can test it (C29).

/**
 * Owner descriptions are raw text, and most say almost nothing: on staging the
 * median is 15 characters and a quarter are empty. A snippet built from "nice"
 * or a phone number is worse than the generated sentence, so below this length
 * the generated one wins.
 */
export const MIN_USEFUL_DESCRIPTION = 40;

/** The owner's text when it has content, whitespace flattened; else `fallback`. */
export function pickDescription(
  owner: string | null | undefined,
  fallback: string,
): string {
  const text = owner?.replace(/\s+/g, " ").trim() ?? "";
  return text.length >= MIN_USEFUL_DESCRIPTION ? text : fallback;
}
