import { toast } from "sonner";

/**
 * Share a listing using the Web Share API when available (native share sheet
 * on mobile / supported browsers), otherwise copy a title + URL block to the
 * clipboard so the user can paste it into any social network. Pasting the URL
 * triggers the OG preview card on Facebook, X, LinkedIn, WhatsApp, Telegram,
 * Discord, etc.; the leading title gives context where previews are stripped.
 */
export async function shareListing(title: string, url?: string): Promise<void> {
  const shareUrl =
    url ?? (typeof window !== "undefined" ? window.location.href : "");
  if (!shareUrl) return;

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function"
  ) {
    try {
      await navigator.share({ title, url: shareUrl });
      return;
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
    }
  }

  const text = `${title}\n\n${shareUrl}`;
  try {
    await navigator.clipboard.writeText(text);
    toast.success("ბმული დაკოპირდა — ჩასვი სოციალურ ქსელში");
  } catch {
    toast.error("გაზიარება ვერ მოხერხდა");
  }
}
