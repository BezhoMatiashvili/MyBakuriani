import { ConsentForm } from "@/components/consent/ConsentForm";

// Deliberately OUTSIDE src/app/[locale]/, mirroring /site-locked: middleware
// returns it before next-intl runs, so it never interacts with locale routing
// (C2). That also means there is no NextIntlClientProvider here, so the copy is
// plain Georgian - exactly as /site-locked does - and it does not participate
// in C1's namespace/parity rules.
//
// This is the server-side backstop that requireConsent() redirects into. The
// ConsentGate overlay suppresses itself on this path so nothing double-renders.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "თანხმობა საჭიროა | MyBakuriani",
  robots: { index: false, follow: false },
};

export default function ConsentRequiredPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <ConsentForm
          source="registration_gate"
          labels={{
            title: "MyBakuriani-ზე ანგარიშის შექმნა",
            intro: "გაგრძელებამდე გთხოვთ დაადასტუროთ შემდეგი:",
            terms: "ვეთანხმები",
            termsLink: "წესებსა და პირობებს",
            privacy: "გავეცანი",
            privacyLink: "კონფიდენციალურობის პოლიტიკას",
            marketingTitle: "მსურს მივიღო MyBakuriani-ისა და განცხადების ავტორების სპეციალური შეთავაზებები, ფასდაკლებები და სხვა სარეკლამო შეტყობინებები მონიშნული არხებით",
            marketingPolicyLink: "(პირდაპირი მარკეტინგის პოლიტიკა)",
            channelSms: "SMS",
            channelEmail: "ელფოსტა",
            channelWhatsapp: "WhatsApp",
            channelPush: "Push",
            marketingNote:
              "არასავალდებულოა — შეგიძლიათ მონიშნოთ ერთი, რამდენიმე ან არცერთი არხი. თანხმობის გაუქმება ნებისმიერ დროს, უფასოდ შეგიძლიათ პროფილის პარამეტრებიდან. სერვისული შეტყობინებები (მაგ. ავტორიზაციის კოდები, ჯავშნები) ამაზე არ არის დამოკიდებული.",
            submit: "გაგრძელება",
            signOut: "გასვლა",
            error: "ვერ მოხერხდა შენახვა. გთხოვთ, სცადოთ თავიდან.",
          }}
        />
      </div>
    </main>
  );
}
