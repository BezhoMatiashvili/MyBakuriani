"use client";

import type { ReactNode } from "react";
import { useMoney, type SaleMoneyRow } from "@/lib/currency/client";
import type { CurrencyCode } from "@/lib/currency/money";

/**
 * A public price that follows the visitor's currency pick (C55). On the
 * server and until the visitor picks, it renders `children` (default: the
 * price in its own currency through formatPrice / formatSalePrice), so ISR
 * HTML and hydration stay as they were; the converted text replaces it after
 * hydration. A sale (`sale`, C54) renders `children` the same way (its price
 * in its seller's currency, as the server printed it with format.ts), and
 * after a pick useMoney().sale's text: the other stored number (a legacy
 * dollar-only row: converted). Text only: no wrapper element, the caller keeps
 * its styling.
 */
export function Money(
  props:
    | {
        amount: number;
        from: CurrencyCode;
        sale?: undefined;
        children?: ReactNode;
      }
    | {
        sale: SaleMoneyRow;
        amount?: undefined;
        from?: undefined;
        children?: ReactNode;
      },
) {
  const money = useMoney();
  if (props.sale) {
    const text = money.sale(props.sale)?.text ?? null;
    return (
      <>
        {money.currency ? (text ?? props.children) : (props.children ?? text)}
      </>
    );
  }
  const { amount, from, children } = props;
  return (
    <>
      {money.converted(amount, from) ?? children ?? money.format(amount, from)}
    </>
  );
}
