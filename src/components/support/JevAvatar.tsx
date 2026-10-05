import { Sparkles } from "lucide-react";

/** Jev's round mark: the brand blue fading into indigo with a sparkle. */
export function JevAvatar({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const box = { sm: "size-6", md: "size-9", lg: "size-14" }[size];
  const icon = { sm: "size-3.5", md: "size-4.5", lg: "size-6" }[size];
  return (
    <span
      aria-hidden
      className={`${box} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2563EB] to-[#4F46E5] text-white`}
    >
      <Sparkles className={icon} strokeWidth={2.25} />
    </span>
  );
}
