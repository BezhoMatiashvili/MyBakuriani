import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export interface FaqEntry {
  question: string;
  answer: ReactNode;
}

// Questions and answers in native <details>: collapsed for people, present in
// the HTML for crawlers, no client JavaScript (C40). Shared by the category
// intros and the resort guide.
export default function FaqList({
  items,
  className = "",
}: {
  items: readonly FaqEntry[];
  className?: string;
}) {
  return (
    <div
      className={`divide-y divide-[#E2E8F0] rounded-[16px] border border-[#E2E8F0] bg-white ${className}`.trim()}
    >
      {items.map((item) => (
        <details key={item.question} className="group px-4 sm:px-5">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-3 text-[15px] font-bold leading-[22px] text-[#1E293B] [&::-webkit-details-marker]:hidden">
            <span>{item.question}</span>
            <ChevronDown
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-[#64748B] transition-transform group-open:rotate-180"
            />
          </summary>
          <p className="pb-4 text-[15px] font-medium leading-[27px] text-[#475569]">
            {item.answer}
          </p>
        </details>
      ))}
    </div>
  );
}
