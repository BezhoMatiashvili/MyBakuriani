// Blog post languages (C60). A post is written in Georgian; the admin may add an
// English and a Russian translation (blog_posts.title_en/excerpt_en/content_en,
// *_ru). A translation counts only with its title AND its body, and a page shows
// one language whole: the translation, or the Georgian post when there is none.
// Deliberately free of imports: the admin editor loads it in the browser and
// scripts/unit imports it directly (C29).

export const BLOG_LOCALES = ["ka", "en", "ru"] as const;
export type BlogLocale = (typeof BLOG_LOCALES)[number];
export type BlogTranslationLocale = Exclude<BlogLocale, "ka">;
export const BLOG_TRANSLATION_LOCALES: readonly BlogTranslationLocale[] = [
  "en",
  "ru",
];

export interface BlogPostTexts {
  title: string;
  excerpt: string | null;
  content: string;
  title_en?: string | null;
  excerpt_en?: string | null;
  content_en?: string | null;
  title_ru?: string | null;
  excerpt_ru?: string | null;
  content_ru?: string | null;
}

export interface LocalizedBlogTexts {
  title: string;
  excerpt: string | null;
  content: string;
  /** The language the texts are in (what inLanguage and lang= must say). */
  lang: BlogLocale;
}

function filled(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** True when the post has a usable translation into `locale`. */
export function hasBlogTranslation(
  post: BlogPostTexts,
  locale: BlogTranslationLocale,
): boolean {
  return filled(post[`title_${locale}`]) && filled(post[`content_${locale}`]);
}

/** The languages the post can be read in: ka, then each translated one. */
export function blogPostLocales(post: BlogPostTexts): BlogLocale[] {
  return [
    "ka",
    ...BLOG_TRANSLATION_LOCALES.filter((l) => hasBlogTranslation(post, l)),
  ];
}

/** The post's texts in `locale` when translated, else the Georgian post, never a mix. */
export function localizeBlogPost(
  post: BlogPostTexts,
  locale: string,
): LocalizedBlogTexts {
  const l = BLOG_TRANSLATION_LOCALES.find((x) => x === locale);
  if (l && hasBlogTranslation(post, l)) {
    const excerpt = post[`excerpt_${l}`];
    return {
      title: (post[`title_${l}`] as string).trim(),
      excerpt: filled(excerpt) ? excerpt.trim() : null,
      content: post[`content_${l}`] as string,
      lang: l,
    };
  }
  return {
    title: post.title,
    excerpt: post.excerpt,
    content: post.content,
    lang: "ka",
  };
}
