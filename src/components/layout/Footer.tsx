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
    <footer className="border-t border-white/5 bg-[#0B1C2D] text-white">
      <div className="mx-auto max-w-[1152px] px-4 py-20 sm:px-16">
        {/* Main footer grid */}
        <div className="grid gap-20 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand column */}
          <div className="flex flex-col gap-[23px]">
            <h2 className="text-2xl font-bold">MyBakuriani</h2>
            <p className="max-w-[252px] text-sm leading-[23px] text-white/60">
              პრემიუმ უძრავი ქონების და გაქირავების პლატფორმა ბაკურიანში. ჩვენ
              ვზრუნავთ თქვენს დაცულ დასვენებაზე.
            </p>
            {/* Social icons */}
            <div className="flex gap-4">
              <a
                href="#"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white/60 transition-colors hover:text-white"
              >
                <svg
                  className="h-4 w-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
              </a>
              <a
                href="#"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white/60 transition-colors hover:text-white"
              >
                <svg
                  className="h-4 w-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.174-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24.009 12.017 24.009c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641.001 12.017.001z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Column 2 - პლატფორმა */}
          <div>
            <h3 className="mb-6 text-base font-bold text-white">პლატფორმა</h3>
            <ul className="flex flex-col gap-4">
              {platformLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/60 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3 - სერვისები */}
          <div>
            <h3 className="mb-6 text-base font-bold text-white">სერვისები</h3>
            <ul className="flex flex-col gap-4">
              {serviceLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/60 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 4 - დახმარება */}
          <div>
            <h3 className="mb-6 text-base font-bold text-white">დახმარება</h3>
            <ul className="flex flex-col gap-4">
              {helpLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/60 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-20 border-t border-white/5 pt-8 text-center text-[10px] font-bold uppercase tracking-[1px] text-white/60">
          &copy; {new Date().getFullYear()} MyBakuriani. ყველა უფლება დაცულია.
        </div>
      </div>
    </footer>
  );
}
