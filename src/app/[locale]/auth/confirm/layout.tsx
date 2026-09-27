import type { Metadata } from "next";

// The confirmation URL carries a one-time token_hash: keep the page out of
// search indexes. Title and description come from the auth layout. No referrer
// meta here: it would outlive this page on client-side navigation and strip
// the Referer the Mapbox static preview needs (C6); the app-wide
// strict-origin-when-cross-origin header already keeps the query off other
// origins.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ConfirmEmailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
