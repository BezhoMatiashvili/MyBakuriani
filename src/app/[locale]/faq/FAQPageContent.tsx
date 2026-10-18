import { ChevronDown } from "lucide-react";
import ScrollReveal from "@/components/shared/ScrollReveal";
import type { ResolvedFaq } from "@/lib/faq";

export default function FAQPageContent({ faq }: { faq: ResolvedFaq }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      {/* No entrance fade: the h1 is the LCP element (C40). */}
      <div>
        <h1 className="text-[32px] font-black text-[#1E293B]">{faq.title}</h1>
        {faq.subtitle && (
          <p className="mt-2 text-[13px] font-medium leading-[20px] text-[#64748B]">
            {faq.subtitle}
          </p>
        )}
      </div>
      <div className="mt-10 divide-y divide-border rounded-[24px] border border-[#E2E8F0] bg-white shadow-[0px_16px_40px_-12px_rgba(0,0,0,0.15)]">
        {faq.items.map((item, i) => (
          <ScrollReveal key={item.id} delay={i * 0.05}>
            {/* Native <details>: collapsed for people, but every answer is in
                the HTML for search engines (C40). */}
            <details className="group">
              <summary className="flex min-h-11 w-full cursor-pointer list-none items-center justify-between px-6 py-5 text-left text-[16px] font-bold text-[#1E293B] transition-colors hover:text-[#1E293B]/80 [&::-webkit-details-marker]:hidden">
                <span>{item.question}</span>
                <ChevronDown
                  aria-hidden="true"
                  className="ml-4 h-5 w-5 shrink-0 text-[#94A3B8] transition-transform group-open:rotate-180"
                />
              </summary>
              <p className="whitespace-pre-line px-6 pb-5 text-[14px] leading-relaxed text-[#64748B]">
                {item.answer}
              </p>
            </details>
          </ScrollReveal>
        ))}
      </div>
    </div>
  );
}
