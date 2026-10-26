"use client";

import type { ReactNode } from "react";
import { useMoney } from "@/lib/currency/client";
import type { CurrencyCode } from "@/lib/currency/money";

/**
 * A public price that follows the visitor's currency pick (C55). On the
 * server and until the visitor picks, it renders `children` (default: the
 * price in its own currency through formatPrice / formatSalePrice), so ISR
 * HTML and hydration stay as they were; the converted text replaces it after
 * hydration. Text only: no wrapper element, the caller keeps its styling.
 */
export function Money({
  amount,
  from,
  children,
}: {
  amount: number;
  from: CurrencyCode;
  children?: ReactNode;
}) {
  const money = useMoney();
  return (
    <>
      {money.converted(amount, from) ?? children ?? money.format(amount, from)}
    </>
  );
}
