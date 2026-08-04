import type { Metadata } from "next";
import { SmsConsentClient } from "./SmsConsentClient";

export const metadata: Metadata = {
  title: "SMS consent | MyBakuriani",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function SmsConsentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SmsConsentClient token={token} />;
}
