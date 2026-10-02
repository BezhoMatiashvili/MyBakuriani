import { SkierLoader } from "@/components/shared/SkierLoader";

// /notifications is auth-gated and force-dynamic, so it keeps a loading
// boundary of its own. The locale-wide one was removed because public ISR
// pages must ship real content and real 404s, not a hidden swapped segment (C40).
export default function Loading() {
  return <SkierLoader />;
}
