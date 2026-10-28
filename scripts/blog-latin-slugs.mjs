#!/usr/bin/env node
/**
 * One-off (C40): gives each blog post whose slug is still Georgian script the
 * Latin slug new posts get, keeping its 8-character token. The post page finds
 * a post by that token, so the old link and its /en and /ru twins 308 to the
 * new one.
 *
 * Order: run it only after the app that resolves tokens is deployed (before
 * that, old links would 404). Staging first, prod only with the owner's OK.
 * Don't open the printed Latin links before --apply (the 404 gets cached), and
 * allow about 6 minutes of edge cache afterwards.
 *
 * Dry run by default (reads only). Writing needs both flags:
 *   node --experimental-strip-types --env-file=.env.local scripts/blog-latin-slugs.mjs
 *   node --experimental-strip-types --env-file=.env.local scripts/blog-latin-slugs.mjs --apply --actor=<admin user uuid>
 *
 * Idempotent: Latin slugs are left alone and each write is conditional on the
 * slug it read. --actor is sent as x-actor-id, so audit_logs names the admin.
 * Save the printed old -> new list: audit values are dropped after 90 days
 * (C37).
 */
import { createClient } from "@supabase/supabase-js";
import { blogSlug, blogSlugToken, isLatinSlug } from "../src/lib/blog-slug.ts";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const actor = args
  .find((arg) => arg.startsWith("--actor="))
  ?.slice("--actor=".length);

const unknown = args.filter(
  (arg) => arg !== "--apply" && !arg.startsWith("--actor="),
);
if (unknown.length) {
  console.error(`Unknown argument(s): ${unknown.join(" ")}`);
  process.exit(1);
}
if (!SUPABASE_URL || !KEY) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (--env-file=.env.local).",
  );
  process.exit(1);
}
if (APPLY && !UUID.test(actor ?? "")) {
  console.error("--apply needs --actor=<the admin's user uuid>.");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  ...(APPLY ? { global: { headers: { "x-actor-id": actor } } } : {}),
});
console.log(
  `${APPLY ? "APPLY" : "DRY RUN (nothing is written)"} on ${new URL(SUPABASE_URL).host}`,
);

if (APPLY) {
  const { data: profile, error } = await db
    .from("profiles")
    .select("role")
    .eq("id", actor)
    .maybeSingle();
  if (error) throw error;
  if (profile?.role !== "admin") {
    console.error(`--actor=${actor} is not an admin on this project.`);
    process.exit(1);
  }
}

const { data: posts, error } = await db
  .from("blog_posts")
  .select("id, title, slug, published")
  .order("created_at");
if (error) throw error;

const taken = new Set(posts.map((post) => post.slug));
const renames = [];
for (const post of posts) {
  if (isLatinSlug(post.slug)) continue;
  const token = blogSlugToken(post.slug);
  if (!token) {
    console.log(
      `SKIP ${post.id}: "${post.slug}" ends in no token, so its link could not follow a new slug`,
    );
    continue;
  }
  const to = blogSlug(post.title, token);
  if (taken.has(to)) {
    console.log(`SKIP ${post.id}: "${to}" is already taken`);
    continue;
  }
  taken.add(to);
  renames.push({ ...post, from: post.slug, to });
}

console.log(
  `${posts.length} post(s), ${renames.length} to rename${renames.length ? ":" : "."}`,
);
// The words follow the CURRENT title, which an edit may have changed since
// the old slug was made (PATCH never rewrites the slug).
for (const { id, title, published, from, to } of renames) {
  console.log(
    `${id}${published ? "" : " (draft)"} "${title}"\n  /blog/${from}\n  -> /blog/${to}`,
  );
}

if (!APPLY) {
  if (renames.length) {
    console.log(
      "Don't open the new links before --apply: their 404 would be cached for a few minutes.",
    );
  }
  process.exit(0);
}

let renamed = 0;
for (const { id, from, to } of renames) {
  const { data, error: updateError } = await db
    .from("blog_posts")
    .update({ slug: to })
    .eq("id", id)
    .eq("slug", from)
    .select("id");
  if (updateError) {
    console.error(`FAILED ${id}: ${updateError.message}`);
    process.exitCode = 1;
  } else if (data.length !== 1) {
    console.log(`SKIP ${id}: its slug changed after it was read`);
  } else {
    renamed += 1;
  }
}
console.log(`${renamed} of ${renames.length} renamed.`);
