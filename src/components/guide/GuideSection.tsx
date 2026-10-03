import type { ReactNode } from "react";

// One titled block of running text in a guide page. The h2 names the section's
// topic for search engines and for a reader scanning down the page (C40).
export default function GuideSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-10 sm:mt-12">
      <h2
        id={id}
        className="text-[22px] font-black leading-[28px] text-[#1E293B] lg:text-[26px] lg:leading-[32px]"
      >
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-[15px] font-medium leading-[27px] text-[#475569]">
        {children}
      </div>
    </section>
  );
}
