// Dummy test cards for the sandbox checkout. The server (payment-process edge
// function) is the source of truth for approve/decline — this list only drives
// the on-page helper UI and quick-fill buttons. Keep the numbers in sync with
// the decision table in supabase/functions/payment-process/index.ts.

export type TestCardResult = "approved" | "declined" | "insufficient";

export interface TestCard {
  /** Formatted for display + quick-fill, e.g. "4242 4242 4242 4242". */
  number: string;
  /** i18n key suffix under Checkout.testCards. */
  result: TestCardResult;
}

export const TEST_CARDS: TestCard[] = [
  { number: "4242 4242 4242 4242", result: "approved" },
  { number: "4000 0000 0000 0002", result: "declined" },
  { number: "4000 0000 0000 9995", result: "insufficient" },
];

/** Any future expiry / any 3-digit CVC works — these are just for quick-fill. */
export const DEFAULT_EXPIRY = "12 / 30";
export const DEFAULT_CVC = "123";
export const DEFAULT_CARDHOLDER = "TEST USER";
