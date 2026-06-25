"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

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
        <h1 style={{ fontSize: "28px", fontWeight: 800, margin: 0 }}>
          რაღაც ვერ მოხერხდა
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
          გვერდის ჩატვირთვისას მოხდა შეცდომა. გთხოვთ, სცადოთ ხელახლა.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            height: "48px",
            padding: "0 32px",
            borderRadius: "12px",
            border: "none",
            background: "#2563EB",
            color: "#ffffff",
            fontSize: "15px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          ხელახლა ცადეთ
        </button>
        {/* Hard navigation (not next/link): the global error boundary renders
            outside the app's router context, and a full reload escapes whatever
            broke the current route. */}
        <button
          type="button"
          onClick={() => {
            window.location.href = "/";
          }}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            fontSize: "15px",
            fontWeight: 500,
            color: "#2563EB",
            cursor: "pointer",
          }}
        >
          მთავარ გვერდზე დაბრუნება
        </button>
      </body>
    </html>
  );
}
