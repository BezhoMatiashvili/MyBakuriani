import { createClient } from "@/lib/supabase/server";
import BlogPageClient from "./BlogPageClient";

export const metadata = {
  title: "MyBakuriani — ბლოგი და სიახლეები",
  description:
    "ბაკურიანის უახლესი სიახლეები, რჩევები და სტატიები. გაიგეთ ყველაფერი კურორტის შესახებ.",
};

export default async function BlogPage() {
  const supabase = await createClient();

  const { data: posts } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("published", true)
    .order("published_at", { ascending: false });

  return <BlogPageClient posts={posts ?? []} />;
}
