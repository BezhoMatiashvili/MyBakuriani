import type { LegalDoc } from "@/content/legal";

export default function LegalDocumentView({ doc }: { doc: LegalDoc }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-[32px] font-black text-[#1E293B]">{doc.title}</h1>
      <p className="mt-2 text-[13px] font-medium leading-[20px] text-[#64748B]">
        {doc.lastUpdated}
      </p>
      <article className="mt-10 space-y-8 text-[#1E293B]">
        {doc.intro && (
          <p className="whitespace-pre-line text-[15px] leading-[24px] text-[#475569]">
            {doc.intro}
          </p>
        )}
        {doc.sections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-24">
            <h2 className="text-[20px] font-black text-[#1E293B]">
              {section.title}
            </h2>
            {section.body && (
              <p className="mt-2 whitespace-pre-line text-[15px] leading-[24px] text-[#475569]">
                {section.body}
              </p>
            )}
            {section.bullets && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] leading-[24px] text-[#475569]">
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            )}
            {section.subsections?.map((sub) => (
              <div key={sub.id} id={sub.id} className="mt-4 scroll-mt-24">
                {sub.title && (
                  <h3 className="text-[16px] font-bold text-[#1E293B]">
                    {sub.title}
                  </h3>
                )}
                {sub.body && (
                  <p className="mt-2 whitespace-pre-line text-[15px] leading-[24px] text-[#475569]">
                    {sub.body}
                  </p>
                )}
                {sub.bullets && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] leading-[24px] text-[#475569]">
                    {sub.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
        ))}
      </article>
    </div>
  );
}
