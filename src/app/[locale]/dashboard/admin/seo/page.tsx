"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, PencilLine, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import MediaUploader, {
  type MediaValue,
} from "@/components/forms/MediaUploader";

type BlogPost = {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  image_url: string | null;
  video_url: string | null;
  video_poster_url: string | null;
  published: boolean | null;
  published_at: string | null;
  created_at: string | null;
};

export default function SeoPage() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoPosterUrl, setVideoPosterUrl] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [drafting, setDrafting] = useState(false);
  // The post loaded into the form; null = writing a new one.
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const formRef = useRef<HTMLElement>(null);

  const mediaValue: MediaValue = videoUrl
    ? { url: videoUrl, type: "video" }
    : imageUrl
      ? { url: imageUrl, type: "image" }
      : null;

  function handleMediaChange(v: MediaValue) {
    if (!v) {
      setImageUrl("");
      setVideoUrl("");
      setVideoPosterUrl("");
      return;
    }
    if (v.type === "video") {
      setVideoUrl(v.url);
      setImageUrl("");
    } else {
      setImageUrl(v.url);
      setVideoUrl("");
      setVideoPosterUrl("");
    }
  }

  const [topic, setTopic] = useState("ბაკურიანში ზამთრის დასვენება");
  const [keywords, setKeywords] = useState(
    "ბაკურიანი, დიდველი, აჭარა, ბათუმი, თბილისი",
  );

  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/blog", { cache: "no-store" });
    const payload = await res.json();
    if (!res.ok) {
      toast.error(payload.error ?? "ჩატვირთვა ვერ მოხერხდა");
      setPosts([]);
    } else {
      setPosts(payload.posts as BlogPost[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function generateDraft() {
    if (!topic.trim()) {
      toast.error("თემა სავალდებულოა");
      return;
    }
    setDrafting(true);
    try {
      const res = await fetch("/api/admin/blog/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic,
          keywords: keywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
        }),
      });
      const payload = await res.json();
      if (!res.ok)
        throw new Error(payload.error ?? "AI დრაფტის გენერაცია ვერ მოხერხდა");
      setTitle(payload.title ?? "");
      setExcerpt(payload.excerpt ?? "");
      setContent(payload.body_markdown ?? "");
      toast.success("AI დრაფტი მზად არის");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "შეცდომა");
    } finally {
      setDrafting(false);
    }
  }

  function resetForm() {
    setEditing(null);
    setTitle("");
    setExcerpt("");
    setContent("");
    setImageUrl("");
    setVideoUrl("");
    setVideoPosterUrl("");
  }

  function startEdit(post: BlogPost) {
    setEditing(post);
    setTitle(post.title);
    setExcerpt(post.excerpt ?? "");
    setContent(post.content);
    setImageUrl(post.image_url ?? "");
    setVideoUrl(post.video_url ?? "");
    setVideoPosterUrl(post.video_poster_url ?? "");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function deletePost(post: BlogPost) {
    if (
      !window.confirm(
        `წავშალოთ სტატია „${post.title}“? წაშლილი სტატიის აღდგენა შეუძლებელია.`,
      )
    )
      return;
    setDeletingId(post.id);
    try {
      const res = await fetch(`/api/admin/blog/${post.id}`, {
        method: "DELETE",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? "წაშლა ვერ მოხერხდა");
      toast.success("სტატია წაიშალა");
      if (editing?.id === post.id) resetForm();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "შეცდომა");
    } finally {
      setDeletingId(null);
    }
  }

  async function publish(options: { publish: boolean }) {
    if (!title.trim() || !content.trim()) {
      toast.error("სათაური და ტექსტი სავალდებულოა");
      return;
    }
    setPublishing(true);
    try {
      const res = await fetch(
        editing ? `/api/admin/blog/${editing.id}` : "/api/admin/blog",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title,
            content,
            excerpt: excerpt || undefined,
            image_url: imageUrl || undefined,
            video_url: videoUrl || undefined,
            video_poster_url: videoPosterUrl || undefined,
            publish: options.publish,
          }),
        },
      );
      const payload = await res.json();
      if (!res.ok)
        throw new Error(
          payload.error ??
            (editing ? "შენახვა ვერ მოხერხდა" : "გამოქვეყნება ვერ მოხერხდა"),
        );
      toast.success(
        editing
          ? "ცვლილებები შენახულია"
          : options.publish
            ? "გამოქვეყნდა"
            : "შენახულია draft-ად",
      );
      resetForm();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "შეცდომა");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8 pb-10">
      <header className="space-y-2">
        <h1 className="text-[32px] font-black leading-8 tracking-[-0.8px] text-[#0F172A]">
          სიახლეები &amp; ბლოგი
        </h1>
        <p className="text-[14px] font-medium leading-[21px] text-[#64748B]">
          SEO სტატიების წერა AI-ს დახმარებით.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section
          ref={formRef}
          className="scroll-mt-6 rounded-[24px] border border-[#E2E8F0] bg-white p-8 shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)]"
        >
          <div className="mb-6 flex items-center justify-between gap-3">
            <h2 className="inline-flex items-center gap-2 text-[18px] font-black leading-7 text-[#1E293B]">
              <PencilLine className="h-5 w-5 text-[#2563EB]" />
              {editing ? "სტატიის რედაქტირება" : "სტატიის დაწერა"}
            </h2>
            {editing ? (
              <button
                type="button"
                onClick={resetForm}
                disabled={publishing}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 text-[13px] font-bold text-[#64748B] hover:bg-[#F1F5F9] disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                გაუქმება
              </button>
            ) : null}
          </div>
          <div className="space-y-4">
            <MediaUploader
              // A fresh uploader per post, so its preview state never carries
              // over from the previous one.
              key={editing?.id ?? "new"}
              value={mediaValue}
              onChange={handleMediaChange}
              kind="blog"
              label="ჰერო მედია (სურათი ან ვიდეო)"
              poster={videoPosterUrl || null}
              onPosterChange={(url) => setVideoPosterUrl(url ?? "")}
              keepUrls={
                editing
                  ? [
                      editing.image_url,
                      editing.video_url,
                      editing.video_poster_url,
                    ]
                  : undefined
              }
            />
            <input
              placeholder="სტატიის სათაური..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-[51px] w-full rounded-xl border border-[#E2E8F0] bg-white px-[14px] text-[14px] font-medium leading-[21px] text-[#1E293B] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] outline-none placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10"
            />
            <textarea
              placeholder="მოკლე აღწერა (excerpt)..."
              rows={2}
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              className="w-full rounded-xl border border-[#E2E8F0] bg-white px-[14px] py-3 text-[14px] font-medium leading-[21px] text-[#1E293B] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] outline-none placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10"
            />
            <textarea
              placeholder="სტატიის სრული ტექსტი (Markdown)..."
              rows={8}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full rounded-xl border border-[#E2E8F0] bg-white px-[14px] py-3 text-[14px] font-medium leading-[21px] text-[#1E293B] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] outline-none placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10"
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => publish({ publish: false })}
                disabled={publishing}
                className="h-[53px] min-h-[44px] rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-[14px] font-bold text-[#475569] disabled:opacity-50"
              >
                {publishing ? "..." : "შენახვა draft-ად"}
              </button>
              <button
                type="button"
                onClick={() => publish({ publish: true })}
                disabled={publishing}
                className="h-[53px] min-h-[44px] rounded-xl bg-[#2563EB] text-[14px] font-bold text-white shadow-[0px_8px_20px_rgba(37,99,235,0.25)] disabled:opacity-50"
              >
                {editing ? "შენახვა და გამოქვეყნება" : "გამოქვეყნება"}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-[#E2E8F0] bg-white p-8 shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[18px] font-black leading-7 text-[#1E293B]">
              AI დრაფტირება
            </h2>
            <span className="rounded-lg bg-[#FAF5FF] px-3 py-1 text-xs font-extrabold uppercase tracking-[1px] text-[#7C3AED]">
              Gemini 3.1 Flash Lite
            </span>
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-2 block pl-1 text-[12px] font-bold leading-[18px] text-[#334155]">
                თემა
              </label>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="h-[51px] w-full rounded-xl border border-[#E2E8F0] bg-white px-[14px] text-[14px] font-medium text-[#1E293B] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] outline-none focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10"
              />
            </div>
            <div>
              <label className="mb-2 block pl-1 text-[12px] font-bold leading-[18px] text-[#334155]">
                საკვანძო სიტყვები (KEYWORDS)
              </label>
              <textarea
                rows={3}
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                className="w-full rounded-xl border border-[#E2E8F0] bg-white px-[14px] py-3 text-[14px] font-medium text-[#1E293B] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] outline-none focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10"
              />
            </div>
            <button
              type="button"
              onClick={generateDraft}
              disabled={drafting}
              className="inline-flex h-[53px] min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[#DDD6FE] bg-[#FAF5FF] text-[14px] font-bold text-[#7C3AED] disabled:opacity-50"
            >
              {drafting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              AI დრაფტი
            </button>
          </div>
        </section>
      </div>

      <section className="rounded-[24px] border border-[#E2E8F0] bg-white p-8 shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)]">
        <h2 className="mb-6 text-[18px] font-black leading-7 text-[#1E293B]">
          სტატიები ({posts.length})
        </h2>
        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, idx) => (
              <Skeleton key={idx} className="h-[72px] w-full rounded-xl" />
            ))
          ) : posts.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#94A3B8]">
              ჯერ არ არის სტატიები
            </p>
          ) : (
            posts.map((post) => (
              <div
                key={post.id}
                className={`flex flex-col gap-2 rounded-xl border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${
                  editing?.id === post.id
                    ? "border-[#BFDBFE] bg-[#EFF6FF]"
                    : "border-[#F1F5F9] bg-[#F8FAFC]"
                }`}
              >
                <div className="flex min-w-0 items-center gap-3 pr-3">
                  {post.video_url ? (
                    <video
                      src={post.video_url}
                      poster={
                        post.video_poster_url ?? post.image_url ?? undefined
                      }
                      muted
                      loop
                      playsInline
                      className="h-12 w-12 shrink-0 rounded-lg object-cover"
                    />
                  ) : post.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={post.image_url}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-lg object-cover"
                    />
                  ) : null}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#1E293B]">
                      {post.title}
                    </p>
                    <p className="truncate text-[11px] font-medium text-[#64748B]">
                      /{post.slug} •{" "}
                      {post.published ? "გამოქვეყნებული" : "შავი ვარიანტი"}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                  <span
                    className={`mr-1 rounded-md border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.5px] ${
                      post.published
                        ? "border-[#D1FAE5] bg-[#ECFDF5] text-[#10B981]"
                        : "border-[#E2E8F0] bg-white text-[#64748B]"
                    }`}
                  >
                    {post.published ? "აქტიური" : "Draft"}
                  </span>
                  <button
                    type="button"
                    onClick={() => startEdit(post)}
                    disabled={publishing || deletingId === post.id}
                    aria-label={`რედაქტირება: ${post.title}`}
                    title="რედაქტირება"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[#2563EB] hover:bg-[#EFF6FF] disabled:opacity-50"
                  >
                    <PencilLine className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deletePost(post)}
                    disabled={publishing || deletingId === post.id}
                    aria-label={`წაშლა: ${post.title}`}
                    title="წაშლა"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[#B91C1C] hover:bg-[#FEF2F2] disabled:opacity-50"
                  >
                    {deletingId === post.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
