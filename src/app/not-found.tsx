import Link from "next/link";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="text-[80px] font-black leading-none text-brand-accent">
        404
      </div>
      <h1 className="mt-4 text-[28px] font-black text-[#1E293B]">
        გვერდი ვერ მოიძებნა
      </h1>
      <p className="mt-2 max-w-md text-[15px] leading-[24px] text-[#64748B]">
        სამწუხაროდ, მოთხოვნილი გვერდი არ არსებობს ან წაშლილია.
      </p>
      <Link href="/">
        <Button className="mt-8 h-[55px] gap-2 rounded-2xl bg-brand-accent px-8 text-[15px] font-bold tracking-[0.375px] text-white hover:bg-brand-accent-hover">
          <Home className="h-4 w-4" />
          მთავარ გვერდზე დაბრუნება
        </Button>
      </Link>
    </div>
  );
}
