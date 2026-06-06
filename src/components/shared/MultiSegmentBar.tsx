interface Props {
  total: number;
  sold: number;
  reserved: number;
  size?: "sm" | "md";
}

/**
 * Sales-progress bar: green = sold, amber = reserved, light track = free.
 * Segment widths are proportional to counts. Renders an empty track when
 * total <= 0 (callers typically guard on that).
 */
export default function MultiSegmentBar({
  total,
  sold,
  reserved,
  size = "md",
}: Props) {
  const barHeight = size === "sm" ? "h-1.5" : "h-2";
  const soldPct = total > 0 ? (Math.min(sold, total) / total) * 100 : 0;
  const reservedPct =
    total > 0
      ? (Math.min(reserved, total - Math.min(sold, total)) / total) * 100
      : 0;

  return (
    <div
      className={`${barHeight} flex w-full overflow-hidden rounded-full bg-[#F1F5F9]`}
    >
      {soldPct > 0 && (
        <div
          className="h-full bg-[#16A34A] transition-all duration-500"
          style={{ width: `${soldPct}%` }}
        />
      )}
      {reservedPct > 0 && (
        <div
          className="h-full bg-[#F59E0B] transition-all duration-500"
          style={{ width: `${reservedPct}%` }}
        />
      )}
    </div>
  );
}
