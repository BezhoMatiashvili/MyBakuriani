// Display-only helper data. The Edge function owns the actual sandbox decision
// table, so changing this list cannot approve a card or credit a wallet.
export type TestCardResult = "approved" | "declined" | "insufficient";

export interface TestCard {
  number: string;
  result: TestCardResult;
}

export const TEST_CARDS: TestCard[] = [
  { number: "4242 4242 4242 4242", result: "approved" },
  { number: "4000 0000 0000 0002", result: "declined" },
  { number: "4000 0000 0000 9995", result: "insufficient" },
];

export const DEFAULT_EXPIRY = "12 / 30";
export const DEFAULT_CVC = "123";
export const DEFAULT_CARDHOLDER = "TEST USER";
