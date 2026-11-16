// Server-side half of C60: the one allowlist every blog body passes on write
// (admin POST/PATCH, AI draft) and again when the public page renders it.
// Never import this from a "use client" file (sanitize-html stays out of the
// browser bundle); scripts/unit imports it directly, so no `@/` imports.
import sanitizeHtml from "sanitize-html";
import { marked } from "marked";
import {
  editorHtmlFor,
  isBlankContent,
  isOwnHost,
  isRichHtml,
  normalizeLinkUrl,
  plainTextToHtml,
} from "./content";

export const ALLOWED_TAGS = [
  "p",
  "br",
  "h2",
  "h3",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "a",
];

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: { a: ["href", "target", "rel"] },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: {},
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  transformTags: {
    b: "strong",
    i: "em",
    h1: "h2",
    h4: "h3",
    h5: "h3",
    h6: "h3",
    // Link attributes come from the href alone, never from the stored HTML.
    // A bad href turns the link into a tag outside the allowlist: its text
    // stays, the link goes.
    a: (_tagName, attribs): sanitizeHtml.Tag => {
      const href = normalizeLinkUrl(attribs.href ?? "");
      if (!href) return { tagName: "span", attribs: {} };
      const external =
        /^https?:/i.test(href) && !isOwnHost(new URL(href).hostname);
      return {
        tagName: "a",
        attribs: external
          ? { href, target: "_blank", rel: "noopener noreferrer" }
          : { href },
      };
    },
  },
};

const BLOCKS = new Set(["p", "h2", "h3", "ul", "ol"]);

// Top-level text and inline elements (e.g. left by a dropped <blockquote>,
// <pre> or <table>) are wrapped in <p>, so the result always opens with a
// block tag and isRichHtml keeps reading it as HTML. Input is sanitize-html
// output: allowlisted tags only, every element closed.
function wrapLooseInline(html: string): string {
  let out = "";
  let loose = "";
  let depth = 0;
  let inBlock = false;
  for (const [piece, close, name] of html.matchAll(
    /<(\/?)([a-z0-9]+)[^>]*>|[^<]+|</gi,
  )) {
    const tag = name?.toLowerCase();
    if (depth === 0 && tag && !close && BLOCKS.has(tag)) {
      out += loose.trim() ? `<p>${loose.trim()}</p>` : loose;
      loose = "";
      inBlock = true;
    } else if (depth === 0) {
      inBlock = false;
    }
    if (inBlock) out += piece;
    else loose += piece;
    if (tag && tag !== "br") depth = Math.max(0, depth + (close ? -1 : 1));
  }
  return out + (loose.trim() ? `<p>${loose.trim()}</p>` : loose);
}

/** The allowlisted HTML: "" or markup that opens with a block tag. */
export function sanitizeBlogHtml(html: string): string {
  // The second pass settles nesting a removed tag leaves behind
  // (`<p><noscript><p>` -> `<p><p>`), so the result is a fixed point.
  const clean = sanitizeHtml(sanitizeHtml(html, OPTIONS), OPTIONS);
  return wrapLooseInline(clean).trim();
}

/** What a write stores: sanitized HTML (plain text becomes paragraphs), "" if empty. */
export function normalizeBlogContent(raw: string): string {
  const html = sanitizeBlogHtml(editorHtmlFor(raw));
  return isBlankContent(html) ? "" : html;
}

/** The public page's HTML for a rich post; null = older plain text, shown as before. */
export function richHtmlOrNull(content: string): string | null {
  return isRichHtml(content) ? sanitizeBlogHtml(content) : null;
}

/** The AI draft's Markdown as editor HTML. */
export function markdownToBlogHtml(markdown: string): string {
  const html = sanitizeBlogHtml(marked.parse(markdown, { async: false }));
  return html || plainTextToHtml(markdown);
}
