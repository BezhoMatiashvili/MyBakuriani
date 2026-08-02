export function toCanonicalGePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  const local = digits.startsWith("995") ? digits.slice(3) : digits;
  if (!/^5\d{8}$/.test(local)) return null;
  return `+995${local}`;
}
