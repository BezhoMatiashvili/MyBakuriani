import Link from "next/link";

// Root-level fallback for URLs that don't match any route at all (e.g. no
// locale segment resolves). `[locale]/not-found.tsx` only covers not-found
// cases inside a matched locale tree; without this root one, those requests
// fell through to Next.js's bare default 404 (English, unbranded). Renders
// outside the [locale] layout (no <html>/<body> from a parent), so it needs
// its own — same pattern as global-error.tsx — with inline styles rather than
// Tailwind classes for the same reliability reason.
export default function NotFound() {
  return (
    <html lang="ka">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          padding: "24px",
          textAlign: "center",
          fontFamily:
            "'Noto Sans Georgian', system-ui, -apple-system, sans-serif",
          background: "#F8FAFC",
          color: "#0F172A",
        }}
      >
        <div
          style={{
            fontSize: "80px",
            fontWeight: 900,
            lineHeight: 1,
            color: "#2563EB",
          }}
        >
          404
        </div>
        <h1 style={{ fontSize: "28px", fontWeight: 800, margin: 0 }}>
          გვერდი ვერ მოიძებნა
        </h1>
        <p
          style={{
            fontSize: "15px",
            lineHeight: "24px",
            color: "#64748B",
            maxWidth: "420px",
            margin: 0,
          }}
        >
          სამწუხაროდ, მოთხოვნილი გვერდი არ არსებობს ან წაშლილია.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: "55px",
            padding: "0 32px",
            borderRadius: "16px",
            background: "#2563EB",
            color: "#ffffff",
            fontSize: "15px",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          მთავარ გვერდზე დაბრუნება
        </Link>
      </body>
    </html>
  );
}
