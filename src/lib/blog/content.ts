// Blog article body (C60). `blog_posts.content` holds either the editor's
// sanitized HTML or, for posts written before the rich text editor, plain text
// shown exactly as before (whitespace-pre-line). Deliberately free of imports:
// the public search page and the admin editor load it in the browser, and
// scripts/unit imports it directly (C29). The sanitizer lives in ./sanitize.

const RICH_START = /^<(p|h2|h3|ul|ol)[\s>]/i;

/** True when the text is the editor's HTML (it always opens with a block tag). */
export function isRichHtml(content: string): boolean {
  return RICH_START.test(content.trim());
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Plain text as editor HTML: blank lines start paragraphs, newlines are <br>. */
export function plainTextToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((block) => block.replace(/^\n+|\n+$/g, ""))
    .filter((block) => block.trim())
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** What the editor opens with: HTML as stored, older plain text as paragraphs. */
export function editorHtmlFor(content: string): string {
  return isRichHtml(content) ? content : plainTextToHtml(content);
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  nbsp: " ",
};

/** Visible text of the HTML (search snippets, emptiness); tolerates a cut tag. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<\/?(p|h2|h3|ul|ol|li)\b[^>]*>|<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/<[^>]*$/, "")
    .replace(
      /&(amp|lt|gt|quot|#39|nbsp);/g,
      (_, name: string) => ENTITIES[name],
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** Empty by its text, so the editor's `<p></p>` counts as empty. */
export function isBlankContent(content: string): boolean {
  return !(isRichHtml(content) ? htmlToPlainText(content) : content.trim());
}

/** A search result's excerpt; global_search falls back to the cut body. */
export function blogSnippet(excerpt: string): string {
  return isRichHtml(excerpt) ? htmlToPlainText(excerpt) : excerpt;
}

const OWN_HOSTS = new Set([
  "mybakuriani.ge",
  "www.mybakuriani.ge",
  "mybakuriani.com",
  "mybakuriani.com.ge",
]);

export function isOwnHost(hostname: string): boolean {
  return OWN_HOSTS.has(hostname.toLowerCase());
}

const BARE_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(:\d+)?([/?#]|$)/i;

/**
 * The one link rule (editor and sanitizer): http(s), mailto, tel or a
 * same-site "/path"; a bare "host.tld/path" gets https://. Anything else
 * (javascript:, data:, "//host", "#x", spaces, backslashes, user:pass@)
 * is null. The accepted string is returned as typed, not re-serialised.
 */
export function normalizeLinkUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value || /[\s\u0000-\u001f\u007f\\]/.test(value)) return null;
  if (value.startsWith("/")) return value.startsWith("//") ? null : value;
  if (/^mailto:[^@]+@[^@]+$/i.test(value)) return value;
  if (/^tel:\+?[0-9()\-.]{3,}$/i.test(value)) return value;
  const href = /^https?:\/\//i.test(value)
    ? value
    : BARE_HOST.test(value)
      ? `https://${value}`
      : null;
  if (!href) return null;
  try {
    const url = new URL(href);
    return url.hostname && !url.username && !url.password ? href : null;
  } catch {
    return null;
  }
}
