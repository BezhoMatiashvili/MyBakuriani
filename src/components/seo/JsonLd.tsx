import { serializeJsonLd, type JsonLdObject } from "@/lib/seo/jsonld";

// A server-rendered data block: no client JS, and the strict CSP leaves
// non-executable script types alone. Serialization escapes `<` (C40).
export default function JsonLd({
  data,
}: {
  data: JsonLdObject | readonly JsonLdObject[];
}) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
