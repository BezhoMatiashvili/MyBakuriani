import Link from "next/link";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="text-7xl font-bold text-brand-accent">404</div>
      <h1 className="mt-4 text-2xl font-bold text-foreground">
        გვერდი ვერ მოიძებნა
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        სამწუხაროდ, მოთხოვნილი გვერდი არ არსებობს ან წაშლილია.
      </p>
      <Link href="/">
        <Button className="mt-6 gap-2 bg-brand-accent text-white hover:bg-brand-accent-hover">
          <Home className="h-4 w-4" />
          მთავარ გვერდზე დაბრუნება
        </Button>
      </Link>
    </div>
  );
}
