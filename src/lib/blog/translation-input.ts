// The admin routes' reading of a post's English and Russian texts (C60).
// Server-only: it sanitizes through ./sanitize (sanitize-html never reaches the
// browser). A translation is its title AND its body; half of one is refused (the
// blog_posts_*_complete CHECKs would refuse it too) and one sent empty is
// stored as NULLs, which removes it. A language the request does not mention is
// left out of the columns, so PATCH keeps it: a client that predates the
// translations (an admin tab opened before a deploy) never erases them.

import { normalizeBlogContent } from "@/lib/blog/sanitize";
import { BLOG_TRANSLATION_LOCALES } from "@/lib/blog/translations";

export type BlogTranslationColumns = {
  title_en: string | null;
  excerpt_en: string | null;
  content_en: string | null;
  title_ru: string | null;
  excerpt_ru: string | null;
  content_ru: string | null;
};

export const BLOG_TRANSLATION_INCOMPLETE =
  "თარგმანს სჭირდება სათაურიც და ტექსტიც";

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readBlogTranslations(
  body: Record<string, unknown> | null,
):
  | { ok: true; columns: Partial<BlogTranslationColumns> }
  | { ok: false; error: string } {
  const columns: Partial<BlogTranslationColumns> = {};
  for (const l of BLOG_TRANSLATION_LOCALES) {
    const keys = [`title_${l}`, `excerpt_${l}`, `content_${l}`];
    if (!body || !keys.some((key) => key in body)) continue;
    const title = text(body?.[`title_${l}`]);
    const raw = body?.[`content_${l}`];
    const content =
      (typeof raw === "string" ? normalizeBlogContent(raw) : "") || null;
    const excerpt = text(body?.[`excerpt_${l}`]);
    if ((title === null) !== (content === null)) {
      return { ok: false, error: BLOG_TRANSLATION_INCOMPLETE };
    }
    columns[`title_${l}`] = title;
    columns[`content_${l}`] = content;
    // An excerpt without its translation has no page to describe.
    columns[`excerpt_${l}`] = title === null ? null : excerpt;
  }
  return { ok: true, columns };
}
