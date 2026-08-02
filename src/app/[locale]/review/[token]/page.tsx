import { ManualReviewClient } from "./ManualReviewClient";

export default async function ManualReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ManualReviewClient token={token} />;
}
