// Which /employment schedule chip a vacancy belongs to. The vacancy form stores
// the Georgian label in services.employment_type ("სრული განაკვეთი"); the
// 2026-05 demo seed stored the chip ids themselves ("fulltime"). The caller
// passes optionKeyFor("employmentTypes", raw) from lib/constants/listing-options,
// so this file stays import-free for the scripts/unit tests (C29).

export type ScheduleChipId = "fulltime" | "parttime" | "seasonal" | "other";

export function scheduleChipId(
  raw: string | null | undefined,
  optionKey: string | null,
): ScheduleChipId {
  switch (optionKey ?? raw) {
    case "full_time":
    case "fulltime":
      return "fulltime";
    case "part_time":
    case "parttime":
      return "parttime";
    case "seasonal":
      return "seasonal";
    default:
      return "other";
  }
}
