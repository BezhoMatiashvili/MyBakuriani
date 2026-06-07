export const RENOVATION_STATUSES = [
  { value: "black_frame", label: "შავი კარკასი" },
  { value: "white_frame", label: "თეთრი კარკასი" },
  { value: "green_frame", label: "მწვანე კარკასი" },
  { value: "renovated", label: "გარემონტებული" },
  { value: "fully_furnished", label: "სრულად მოწყობილი" },
] as const;

export const MANAGEMENT_SERVICES = [
  { value: "complex_management", label: "აქვს კომპლექსის მენეჯმენტი" },
  { value: "none", label: "არ აქვს" },
] as const;

const RENOVATION_LABELS = Object.fromEntries(
  RENOVATION_STATUSES.map(({ value, label }) => [value, label]),
) as Record<string, string>;

const MANAGEMENT_LABELS = Object.fromEntries(
  MANAGEMENT_SERVICES.map(({ value, label }) => [value, label]),
) as Record<string, string>;

export function renovationStatusLabel(status: string | null): string | null {
  if (!status) return null;
  return RENOVATION_LABELS[status] ?? status;
}

export function managementServiceLabel(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  return MANAGEMENT_LABELS[value] ?? value;
}
