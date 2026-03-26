import Link from "next/link";

const platformLinks = [
  { label: "ყველა განცხადება", href: "/apartments" },
  { label: "სასტუმროები", href: "/hotels" },
  { label: "აპარტამენტები და კოტეჯები", href: "/apartments" },
  { label: "ყიდვა-გაყიდვა", href: "/sales" },
];

const serviceLinks = [
  { label: "ტრანსპორტი და ტრანსფერები", href: "/transport" },
  { label: "სერვისები და ხელოსნები", href: "/services" },
  { label: "გართობა და აქტივობები", href: "/entertainment" },
  { label: "კვება & რესტორნები", href: "/food" },
  { label: "დასაქმება ბაკურიანში", href: "/employment" },
];

const helpLinks = [
  { label: "ხშირად დასმული კითხვები", href: "/faq" },
  { label: "წესები და პირობები", href: "/terms" },
  { label: "კონტაქტი", href: "/contact" },
];

export function Footer() {
  return (
    <footer className="bg-brand-primary text-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Top section: logo + tagline */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold">MyBakuriani</h2>
          <p className="mt-2 max-w-md text-sm text-white/70">
            პრემიუმ უძრავი ქონების და გაქირავების პლატფორმა ბაკურიანში
          </p>
        </div>

        {/* Three-column grid */}
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {/* Column 1 */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/50">
              პლატფორმა
            </h3>
            <ul className="space-y-2">
              {platformLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/70 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 2 */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/50">
              სერვისები
            </h3>
            <ul className="space-y-2">
              {serviceLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/70 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3 */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/50">
              დახმარება
            </h3>
            <ul className="space-y-2">
              {helpLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/70 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 border-t border-white/10 pt-6 text-center text-sm text-white/50">
          &copy; 2024 MyBakuriani. ჩვენ ვზრუნავთ თქვენს დაცულ დასვენებაზე
        </div>
      </div>
    </footer>
  );
}
