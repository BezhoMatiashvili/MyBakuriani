// Metadata for /hotels lives in page.tsx: a page's generateMetadata overrides its
// layout's, so a layout copy was dead weight and a second place for the copy to
// drift (C40).
export default function HotelsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
