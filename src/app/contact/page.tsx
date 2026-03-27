import type { Metadata } from "next";
import { Mail, Phone, MapPin } from "lucide-react";

export const metadata: Metadata = {
  title: "MyBakuriani — კონტაქტი",
  description: "დაგვიკავშირდით MyBakuriani პლატფორმასთან დაკავშირებით.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <h1 className="text-[26px] font-black leading-[32px] text-[#1E293B]">
        კონტაქტი
      </h1>
      <p className="mt-2 text-muted-foreground">
        გაქვთ შეკითხვა? დაგვიკავშირდით ნებისმიერი ხელმისაწვდომი არხით.
      </p>

      <div className="mt-10 grid gap-6 sm:grid-cols-3">
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-[#E2E8F0] p-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-accent-light text-brand-accent">
            <Phone className="h-6 w-6" />
          </div>
          <h2 className="font-black text-[#1E293B]">ტელეფონი</h2>
          <p className="text-sm text-muted-foreground">+995 555 00 00 00</p>
        </div>

        <div className="flex flex-col items-center gap-3 rounded-3xl border border-[#E2E8F0] p-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-accent-light text-brand-accent">
            <Mail className="h-6 w-6" />
          </div>
          <h2 className="font-black text-[#1E293B]">ელ.ფოსტა</h2>
          <p className="text-sm text-muted-foreground">info@mybakuriani.ge</p>
        </div>

        <div className="flex flex-col items-center gap-3 rounded-3xl border border-[#E2E8F0] p-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-accent-light text-brand-accent">
            <MapPin className="h-6 w-6" />
          </div>
          <h2 className="font-black text-[#1E293B]">მისამართი</h2>
          <p className="text-sm text-muted-foreground">ბაკურიანი, საქართველო</p>
        </div>
      </div>
    </div>
  );
}
