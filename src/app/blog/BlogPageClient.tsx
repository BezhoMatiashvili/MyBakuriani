"use client";

import Image from "next/image";
import Link from "next/link";
import ScrollReveal from "@/components/shared/ScrollReveal";
import type { Tables } from "@/lib/types/database";

const BLOG_POSTS = [
  {
    id: "1",
    title: "ბაკურიანის სეზონი 2026 — რა სიახლეებია?",
    excerpt:
      "წელს ბაკურიანში მრავალი სიახლე გელოდებათ: ახალი ტრასები, გაუმჯობესებული ინფრასტრუქტურა და ახალი სერვისები. გაიგეთ მეტი ჩვენს სტატიაში.",
    image: "/placeholder-property.jpg",
    date: "2026-03-20",
    category: "სიახლეები",
  },
  {
    id: "2",
    title: "როგორ ავირჩიოთ საუკეთესო აპარტამენტი ბაკურიანში",
    excerpt:
      "გაიგეთ რა კრიტერიუმებით უნდა აირჩიოთ აპარტამენტი, რათა თქვენი დასვენება მაქსიმალურად კომფორტული იყოს.",
    image: "/placeholder-property.jpg",
    date: "2026-03-15",
    category: "რჩევები",
  },
  {
    id: "3",
    title: "დიდველის ახალი ტრასები — სრული მიმოხილვა",
    excerpt:
      "დიდველის სათხილამურო კურორტმა ახალი ტრასები გახსნა. გაეცანით დეტალურ მიმოხილვას და რჩევებს.",
    image: "/placeholder-property.jpg",
    date: "2026-03-10",
    category: "სპორტი",
  },
  {
    id: "4",
    title: "ბაკურიანის საუკეთესო რესტორნები 2026",
    excerpt:
      "აღმოაჩინეთ ბაკურიანის ყველაზე პოპულარული რესტორნები და კაფეები, სადაც შეგიძლიათ ქართული და ევროპული სამზარეულო დააგემოვნოთ.",
    image: "/placeholder-property.jpg",
    date: "2026-03-05",
    category: "კვება",
  },
  {
    id: "5",
    title: "საოჯახო დასვენება ბაკურიანში — სრული გზამკვლევი",
    excerpt:
      "რა აქტივობებია ხელმისაწვდომი ბავშვიანი ოჯახებისთვის? სად წავიდეთ და რა ვნახოთ — სრული გზამკვლევი.",
    image: "/placeholder-property.jpg",
    date: "2026-02-28",
    category: "გზამკვლევი",
  },
  {
    id: "6",
    title: "ინვესტიცია ბაკურიანის უძრავ ქონებაში",
    excerpt:
      "რატომ არის ბაკურიანი საუკეთესო ადგილი უძრავი ქონების ინვესტიციისთვის და რა უნდა იცოდეთ ყიდვამდე.",
    image: "/placeholder-property.jpg",
    date: "2026-02-20",
    category: "ინვესტიცია",
  },
];

interface Props {
  posts?: Tables<"blog_posts">[];
}

export default function BlogPageClient({ posts: serverPosts }: Props) {
  const displayPosts =
    serverPosts && serverPosts.length > 0
      ? serverPosts.map((bp) => ({
          id: bp.id,
          title: bp.title,
          excerpt: bp.excerpt ?? "",
          image: bp.image_url ?? "/placeholder-property.jpg",
          date: bp.published_at ?? bp.created_at,
          category: "სიახლეები",
        }))
      : BLOG_POSTS;
  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <ScrollReveal>
        <h1 className="text-3xl font-bold">ბლოგი და სიახლეები</h1>
        <p className="mt-2 text-muted-foreground">
          ბაკურიანის უახლესი სიახლეები, რჩევები და სტატიები
        </p>
      </ScrollReveal>

      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {displayPosts.map((post, i) => (
          <ScrollReveal key={post.id} delay={i * 0.08}>
            <Link
              href={`/blog/${post.id}`}
              className="group block overflow-hidden rounded-[var(--radius-card)] bg-white shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]"
            >
              <div className="relative aspect-[16/9] overflow-hidden">
                <Image
                  src={post.image}
                  alt={post.title}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <span className="absolute top-3 left-3 rounded-md bg-brand-accent px-2.5 py-0.5 text-xs font-medium text-white">
                  {post.category}
                </span>
              </div>
              <div className="p-5">
                <time className="text-xs text-muted-foreground">
                  {post.date}
                </time>
                <h2 className="mt-2 text-base font-semibold leading-snug group-hover:text-brand-accent">
                  {post.title}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                  {post.excerpt}
                </p>
              </div>
            </Link>
          </ScrollReveal>
        ))}
      </div>
    </div>
  );
}
