"use client";

import { useState } from "react";
import { Search, MapPin, Calendar, Users, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SearchFilters {
  location: string;
  date: string;
  guests: number | "";
  cadastralCode: string;
}

interface SearchBoxProps {
  onSearch: (filters: SearchFilters) => void;
  className?: string;
}

export function SearchBox({ onSearch, className }: SearchBoxProps) {
  const [location, setLocation] = useState("");
  const [date, setDate] = useState("");
  const [guests, setGuests] = useState<number | "">("");
  const [cadastralCode, setCadastralCode] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch({ location, date, guests, cadastralCode });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn("rounded-2xl bg-white p-4 shadow-lg md:p-6", className)}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4 md:gap-4">
        {/* Location */}
        <div className="relative">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            ლოკაცია
          </label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="მაგ. ბაკურიანი"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50"
            />
          </div>
        </div>

        {/* Date */}
        <div className="relative">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            თარიღი
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="შეარჩიეთ თარიღი"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50"
            />
          </div>
        </div>

        {/* Guests */}
        <div className="relative">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            სტუმრები
          </label>
          <div className="relative">
            <Users className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="number"
              min={1}
              placeholder="რაოდენობა"
              value={guests}
              onChange={(e) =>
                setGuests(e.target.value ? Number(e.target.value) : "")
              }
              className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50"
            />
          </div>
        </div>

        {/* Cadastral Code */}
        <div className="relative">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            საკადასტრო კოდი
          </label>
          <div className="relative">
            <Hash className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="XX.XX.XX.XXX"
              value={cadastralCode}
              onChange={(e) => setCadastralCode(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          type="submit"
          className="h-10 gap-2 bg-blue-600 px-6 text-white hover:bg-blue-700"
        >
          <Search className="size-4" />
          ძებნა
        </Button>
      </div>
    </form>
  );
}
