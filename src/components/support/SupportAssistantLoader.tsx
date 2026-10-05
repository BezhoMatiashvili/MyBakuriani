"use client";

import dynamic from "next/dynamic";

// The assistant needs the browser (page scans, sessionStorage) and is not part
// of first paint, so its code loads after hydration (C43).
const SupportAssistant = dynamic(
  () => import("./SupportAssistant").then((mod) => mod.SupportAssistant),
  { ssr: false },
);

export function SupportAssistantLoader({
  homeRole,
}: {
  homeRole?: string | null;
}) {
  return <SupportAssistant homeRole={homeRole} />;
}
