// The tax year as /api/admin/finance/tax returns it (finance_tax_year(),
// C42), shared by the tax report and the threshold monitor.

export type TaxMonth = {
  month: string;
  received: number;
  refunds: number;
  adjustments: number;
  net: number;
  owner_share: number;
  platform_revenue: number;
  other_income: number;
  taxable: number;
  cumulative_taxable: number;
  rate: number;
  estimated_tax: number;
};

export type TaxYear = {
  year: number;
  today: string;
  rows: TaxMonth[];
  settings: {
    rate: number;
    highRate: number;
    threshold: number;
    warnPercent: number;
  };
};

/** This year and the four before it. */
export function yearOptions(today: string): string[] {
  const current = Number(today.slice(0, 4));
  return Array.from({ length: 5 }, (_, i) => String(current - i));
}

/** Sum of money values in whole tetri, so totals carry no float error. */
export function sumMoney(values: number[]): number {
  return values.reduce((total, v) => total + Math.round(v * 100), 0) / 100;
}
