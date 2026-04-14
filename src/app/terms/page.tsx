export const metadata = {
  title: "MyBakuriani — წესები და პირობები",
  description: "MyBakuriani პლატფორმის გამოყენების წესები და პირობები.",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-[32px] font-black text-[#1E293B]">
        წესები და პირობები
      </h1>
      <p className="mt-2 text-[13px] font-medium leading-[20px] text-[#64748B]">
        ბოლო განახლება: 2026 წლის 1 მარტი
      </p>
      <article className="prose prose-sm mt-10 max-w-none space-y-8 text-[#1E293B]">
        <section>
          <h2 className="text-[20px] font-black text-[#1E293B]">
            1. ზოგადი დებულებები
          </h2>
          <p className="mt-2 text-[15px] leading-[24px] text-[#475569]">
            წინამდებარე წესები და პირობები არეგულირებს MyBakuriani
            (mybakuriani.ge) პლატფორმის გამოყენებას. პლატფორმაზე რეგისტრაციით
            თქვენ ეთანხმებით ამ წესებსა და პირობებს.
          </p>
        </section>
        <section>
          <h2 className="text-[20px] font-black text-[#1E293B]">
            2. რეგისტრაცია და ანგარიში
          </h2>
          <p className="mt-2 text-[15px] leading-[24px] text-[#475569]">
            რეგისტრაციისთვის საჭიროა ქართული მობილურის ნომერი (+995).
            მომხმარებელი პასუხისმგებელია თავისი ანგარიშის უსაფრთხოებაზე.
          </p>
        </section>
        <section>
          <h2 className="text-[20px] font-black text-[#1E293B]">
            3. ჯავშნის წესები
          </h2>
          <p className="mt-2 text-[15px] leading-[24px] text-[#475569]">
            ჯავშანი ძალაში შედის მესაკუთრის დადასტურების შემდეგ. 48 საათით ადრე
            გაუქმების შემთხვევაში თანხა სრულად უბრუნდება.
          </p>
        </section>
        <section>
          <h2 className="text-[20px] font-black text-[#1E293B]">
            4. გადახდის პირობები
          </h2>
          <p className="mt-2 text-[15px] leading-[24px] text-[#475569]">
            გადახდა ხორციელდება პლატფორმის ბალანსის მეშვეობით. ბალანსის შევსება
            შესაძლებელია TBC ბანკის და BOG-ის ბარათებით.
          </p>
        </section>
      </article>
    </div>
  );
}
