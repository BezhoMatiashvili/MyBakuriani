"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// One table for every finance register (C42). Wide registers scroll inside
// their own frame, so a 375px page never scrolls sideways.

export type Column<T> = {
  key: string;
  header: ReactNode;
  align?: "left" | "right";
  /** Extra classes for the column's cells (e.g. a minimum width). */
  className?: string;
  render: (row: T) => ReactNode;
  /** Shown in the totals row under this column. */
  total?: ReactNode;
};

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowClassName,
  minWidth = 960,
  caption,
  totalsLabel,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowClassName?: (row: T) => string | undefined;
  minWidth?: number;
  caption?: string;
  totalsLabel?: ReactNode;
}) {
  const hasTotals = columns.some((c) => c.total !== undefined);
  return (
    <div className="max-w-full overflow-x-auto rounded-2xl border border-[#E2E8F0] bg-white">
      <table
        className="w-full border-collapse text-left text-[13px]"
        style={{ minWidth }}
      >
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "px-3 py-3 text-[12px] font-bold leading-4 text-[#475569]",
                  column.align === "right" && "text-right",
                  column.className,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={cn(
                "border-b border-[#F1F5F9] align-top last:border-b-0 hover:bg-[#F8FAFC]",
                rowClassName?.(row),
              )}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "px-3 py-2.5 text-[#0F172A]",
                    column.align === "right" && "text-right tabular-nums",
                    column.className,
                  )}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {hasTotals && rows.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-[#E2E8F0] bg-[#F8FAFC] font-bold">
              {columns.map((column, index) => (
                <td
                  key={column.key}
                  className={cn(
                    "px-3 py-3 text-[#0F172A]",
                    column.align === "right" && "text-right tabular-nums",
                  )}
                >
                  {index === 0 && column.total === undefined
                    ? totalsLabel
                    : column.total}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
