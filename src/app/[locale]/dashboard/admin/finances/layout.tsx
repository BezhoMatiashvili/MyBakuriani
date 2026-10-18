import { Suspense } from "react";
import FinanceNav from "@/components/admin/finance/FinanceNav";
import { Skeletons } from "@/components/admin/finance/ui";

// The finance module (C42): its own menu above every page. Pages read their
// filters from the URL, so they render inside a Suspense boundary.
export default function FinancesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1240px] flex-col gap-6 pb-10">
      <FinanceNav />
      <Suspense fallback={<Skeletons count={4} className="h-28" />}>
        {children}
      </Suspense>
    </div>
  );
}
