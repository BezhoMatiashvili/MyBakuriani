"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-error/10">
        <AlertTriangle className="h-8 w-8 text-brand-error" />
      </div>
      <h2 className="mt-4 text-xl font-bold">დაფიქსირდა შეცდომა</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        სამწუხაროდ, რაღაც არასწორად წავიდა. გთხოვთ, სცადეთ თავიდან ან
        დაუკავშირდით მხარდაჭერის გუნდს.
      </p>
      <Button
        onClick={reset}
        className="mt-6 bg-brand-accent text-white hover:bg-brand-accent-hover"
      >
        სცადეთ თავიდან
      </Button>
    </div>
  );
}
