import { toast } from "sonner";

export interface ShareMessages {
  /** Toast shown after the link is copied to the clipboard. */
  copied: string;
  /** Toast shown when neither sharing nor copying worked. */
  error: string;
}

/**
 * Share a listing using the Web Share API when available (native share sheet
 * on mobile / supported browsers), otherwise copy a title + URL block to the
 * clipboard so the user can paste it into any social network. Pasting the URL
 * triggers the OG preview card on Facebook, X, LinkedIn, WhatsApp, Telegram,
 * Discord, etc.; the leading title gives context where previews are stripped.
 *
 * Toast copy is provided by the caller (translated via next-intl).
 */
export async function shareListing(
  title: string,
  messages: ShareMessages,
  url?: string,
): Promise<void> {
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
    toast.success(messages.copied);
  } catch {
    toast.error(messages.error);
  }
}
