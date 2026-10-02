// Metadata for /sales lives in page.tsx: a page's generateMetadata overrides its
// layout's, so a layout copy was dead weight and a second place for the copy to
// drift (C40).
export default function SalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
