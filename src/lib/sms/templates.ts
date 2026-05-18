// Automation SMS templates. Rendered when sms-automation-run enqueues rows.
// Placeholders: {guest_name}, {property_name}, {check_in_date}, {sender_name}.

export type AutomationKind = "check_in" | "review_request" | "win_back";

interface TemplateContext {
  guestName?: string | null;
  propertyName?: string | null;
  checkInDate?: string | null;
  senderName?: string | null;
}

const TEMPLATES: Record<AutomationKind, string> = {
  check_in:
    "გამარჯობა {guest_name}! გვაგონებთ, რომ ხვალ ({check_in_date}) იჯავშნით ბინაში {property_name}. სასიამოვნო დღეების სურვილით — {sender_name} | MyBakuriani",
  review_request:
    "გამარჯობა {guest_name}! გვინდა ვიცოდეთ თქვენი აზრი ბინაში {property_name} ცხოვრებაზე. დატოვეთ შეფასება, რომ სხვა სტუმრებსაც ეცოდინებათ მეტი. — {sender_name}",
  win_back:
    "გამარჯობა {guest_name}! ბევრი ხანი გავიდა და გავიხსენეთ თქვენ. ჩვენი ბინა {property_name} მზად არის ხელახლა მისადეგად — დაგვიკავშირდით სპეციალური ფასისთვის. — {sender_name}",
};

export function renderTemplate(
  kind: AutomationKind,
  ctx: TemplateContext,
): string {
  const tpl = TEMPLATES[kind];
  return tpl
    .replaceAll("{guest_name}", ctx.guestName ?? "სტუმარო")
    .replaceAll("{property_name}", ctx.propertyName ?? "ბაკურიანში")
    .replaceAll("{check_in_date}", ctx.checkInDate ?? "")
    .replaceAll("{sender_name}", ctx.senderName ?? "MyBakuriani");
}
