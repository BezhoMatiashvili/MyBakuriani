import BlogPageClient from "./BlogPageClient";

export const metadata = {
  title: "MyBakuriani — ბლოგი და სიახლეები",
  description:
    "ბაკურიანის უახლესი სიახლეები, რჩევები და სტატიები. გაიგეთ ყველაფერი კურორტის შესახებ.",
};

export default function BlogPage() {
  return <BlogPageClient />;
}
