// The H1 and the opening paragraph of a guide page (C40).
export default function GuideHeading({
  title,
  lead,
}: {
  title: string;
  lead: string;
}) {
  return (
    <header>
      <h1 className="text-[28px] font-black leading-[34px] text-[#1E293B] sm:text-[34px] sm:leading-[42px]">
        {title}
      </h1>
      <p className="mt-4 text-[16px] font-medium leading-[28px] text-[#475569]">
        {lead}
      </p>
    </header>
  );
}
