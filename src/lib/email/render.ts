// Renders one notification row as an email (C33). Import-free so
// scripts/unit/email.test.mjs can load it straight from src/.
//
// The subject and body are the notification's own Georgian title and message,
// which can contain user-written text (listing titles, names), so every value
// is HTML-escaped. `href` must already be an absolute, trusted URL: the caller
// builds it from SITE_URL + a path that passed safeInternalPath().

const BRAND = "#1a56db";
const FOOTER = "ეს არის სერვისული შეტყობინება თქვენი MyBakuriani ანგარიშიდან.";
// Admin email broadcasts are marketing: only opted-in users get them, and every
// one says why and links to the setting ("შეთავაზებები ელფოსტით") to stop them.
const MARKETING_FOOTER =
  "ამ წერილს იღებთ, რადგან MyBakuriani-ზე ჩართული გაქვთ „შეთავაზებები ელფოსტით“.";
const UNSUBSCRIBE = "გამოწერის გაუქმება";
const ACCOUNT = "ჩემი ანგარიში";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Header values may not carry CR/LF (header injection) and are capped. */
export function cleanSubject(value: string): string {
  const flat = value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return (flat || "MyBakuriani").slice(0, 200);
}

export type RenderedEmail = { subject: string; html: string; text: string };

export function renderNotificationEmail(input: {
  subject: string;
  body: string | null;
  href: string | null;
  accountUrl: string;
  /** Georgian cabinet name of the notification's role; null for a global notice. */
  cabinet?: string | null;
  /** An admin broadcast: marketing footer with an unsubscribe link. */
  marketing?: boolean;
}): RenderedEmail {
  const subject = cleanSubject(input.subject);
  const footer = input.marketing ? MARKETING_FOOTER : FOOTER;
  const footerLink = input.marketing ? UNSUBSCRIBE : ACCOUNT;
  const body = (input.body ?? "").trim();
  const cabinet = (input.cabinet ?? "").trim();
  const bodyHtml = escapeHtml(body).replace(/\r?\n/g, "<br>");
  const button = input.href
    ? `<p style="margin:24px 0 0"><a href="${escapeHtml(input.href)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">ნახვა</a></p>`
    : "";

  const html = `<!doctype html>
<html lang="ka"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:'Noto Sans Georgian',Arial,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;padding:28px">
<tr><td style="font-size:18px;font-weight:700;color:${BRAND};padding-bottom:18px">MyBakuriani</td></tr>
<tr><td style="font-size:18px;font-weight:600;line-height:1.4">${escapeHtml(subject)}</td></tr>
${cabinet ? `<tr><td style="font-size:13px;line-height:1.4;padding-top:6px;color:#6b7280">კაბინეტი: ${escapeHtml(cabinet)}</td></tr>` : ""}
${bodyHtml ? `<tr><td style="font-size:15px;line-height:1.6;padding-top:10px;color:#374151">${bodyHtml}</td></tr>` : ""}
<tr><td>${button}</td></tr>
</table>
<p style="max-width:560px;font-size:12px;line-height:1.5;color:#6b7280;margin:16px auto 0">${footer} <a href="${escapeHtml(input.accountUrl)}" style="color:#6b7280">${footerLink}</a></p>
</td></tr></table>
</body></html>`;

  const lines = [subject];
  if (cabinet) lines.push(`კაბინეტი: ${cabinet}`);
  if (body) lines.push("", body);
  if (input.href) lines.push("", `ნახვა: ${input.href}`);
  lines.push("", "--", footer, `${footerLink}: ${input.accountUrl}`);

  return { subject, html, text: lines.join("\n") };
}
