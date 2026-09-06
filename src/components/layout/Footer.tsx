import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ChevronDown } from "lucide-react";

export function Footer() {
  const t = useTranslations("Footer");

  const platformLinks = [
    { label: t("allListings"), href: "/apartments" },
    { label: t("howItWorks"), href: "/faq" },
    { label: t("verification"), href: "/faq" },
    { label: t("pricing"), href: "/apartments" },
  ];

  const serviceLinks = [
    { label: t("transfer"), href: "/transport" },
    { label: t("skiing"), href: "/entertainment" },
    { label: t("snowmobiles"), href: "/entertainment" },
    { label: t("restaurants"), href: "/food" },
  ];

  const helpLinks = [
    { label: t("contact"), href: "/contact" },
    { label: t("faq"), href: "/faq" },
    { label: t("terms"), href: "/terms" },
  ];

  return (
    <footer className="border-t border-white/[0.05] bg-[#0B1C2D] text-white">
      <div className="mx-auto max-w-[1160px] px-4 py-10 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <div className="sm:hidden">
          <FooterBrand description={t("brandDescription")} />
          <div className="mt-8 divide-y divide-white/10 border-y border-white/10">
            <FooterDetails title={t("platform")} links={platformLinks} />
            <FooterDetails title={t("services")} links={serviceLinks} />
            <FooterDetails title={t("help")} links={helpLinks} />
          </div>
        </div>

        <div className="hidden gap-10 sm:grid sm:grid-cols-2 sm:gap-x-20 sm:gap-y-12 lg:grid-cols-4">
          {/* Brand column */}
          <FooterBrand description={t("brandDescription")} />

          {/* Platform */}
          <div>
            <h3 className="mb-6 text-base font-bold text-white">
              {t("platform")}
            </h3>
            <ul className="flex flex-col gap-[16px]">
              {platformLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    prefetch={false}
                    className="inline-flex min-h-11 items-center text-sm text-white/60 transition-colors hover:text-white sm:min-h-0"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Services */}
          <div>
            <h3 className="mb-6 text-base font-bold text-white">
              {t("services")}
            </h3>
            <ul className="flex flex-col gap-[16px]">
              {serviceLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    prefetch={false}
                    className="inline-flex min-h-11 items-center text-sm text-white/60 transition-colors hover:text-white sm:min-h-0"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Help */}
          <div>
            <h3 className="mb-6 text-base font-bold text-white">{t("help")}</h3>
            <ul className="flex flex-col gap-[16px]">
              {helpLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    prefetch={false}
                    className="inline-flex min-h-11 items-center text-sm text-white/60 transition-colors hover:text-white sm:min-h-0"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col items-center gap-2 border-t border-white/[0.05] pt-7 text-center text-[10px] font-bold uppercase tracking-[1px] text-white/60 sm:mt-16 lg:mt-20 lg:pt-8">
          <span>{t("copyright")}</span>
          {/* prefetch={false}: the footer sits on every page, so these two
              prefetched a full RSC payload (~30 KB each) on every page view for
              routes almost nobody opens. Suppressing it frees the connection
              during the window the user is actually clicking something else.
              The links themselves are unchanged. */}
          <div className="flex gap-6">
            <Link
              href="/privacy"
              prefetch={false}
              className="transition-colors hover:text-white"
            >
              {t("privacyPolicy")}
            </Link>
            <Link
              href="/terms"
              prefetch={false}
              className="transition-colors hover:text-white"
            >
              {t("termsOfService")}
            </Link>
          </div>
          {/* Required by WeatherAPI's free-tier terms: free API users must
              credit WeatherAPI.com by name. Do not remove without confirming
              the account is on a paid plan. */}
          <a
            href="https://www.weatherapi.com/"
            target="_blank"
            rel="noreferrer"
            className="normal-case transition-colors hover:text-white"
          >
            Powered by WeatherAPI.com
          </a>
          {/* Required by Mapbox's attribution terms (docs.mapbox.com/help/dive-deeper/attribution):
              API-only usage with no rendered Mapbox map still requires a prominent
              credit near where the data is shown — "Directions powered by Mapbox"
              plus a link. Verified directly against Mapbox's published guidance
              2026-09-05; do not remove while src/lib/road-condition/server.ts calls
              the Mapbox Directions API for the landing road card. */}
          <a
            href="https://www.mapbox.com/"
            target="_blank"
            rel="noreferrer"
            className="normal-case transition-colors hover:text-white"
          >
            Directions powered by Mapbox
          </a>
          {/* Required by the ODbL: clearly credit OpenStreetMap contributors and link
              to "fix the map" wherever OSM-derived data is shown. The Leaflet
              basemaps (property listing maps) use OSM/CARTO tiles directly, and
              Mapbox's own routing data is itself OSM-derived, so this stays
              regardless of which of those two calls the road card. Do not remove
              either link while those are live. Wraps rather than sitting inline: the
              two labels together overflow 375px at this tracking. */}
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
              className="normal-case transition-colors hover:text-white"
            >
              © OpenStreetMap contributors (ODbL)
            </a>
            <a
              href="https://www.openstreetmap.org/fixthemap"
              target="_blank"
              rel="noreferrer"
              className="normal-case transition-colors hover:text-white"
            >
              Improve the map
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterBrand({ description }: { description: string }) {
  return (
    <div className="flex flex-col gap-5 lg:gap-[23px]">
      <Link
        href="/"
        aria-label="MyBakuriani"
        className="flex shrink-0 items-center"
      >
        <Image
          src="/logo-dark.png"
          alt="MyBakuriani"
          width={300}
          height={199}
          className="h-10 w-auto lg:h-12"
        />
      </Link>
      <p className="max-w-[320px] text-sm leading-[22px] text-white/60 lg:max-w-[252px] lg:leading-[23px]">
        {description}
      </p>
      <div className="flex gap-3">
        <SocialLink label="Facebook">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </SocialLink>
        <SocialLink label="Instagram">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
        </SocialLink>
      </div>
    </div>
  );
}

function SocialLink({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href="#"
      aria-label={label}
      className="flex size-11 items-center justify-center rounded-full bg-white/[0.05] text-white/60 transition-colors hover:bg-white/10 hover:text-white"
    >
      <svg className="size-4" fill="currentColor" viewBox="0 0 24 24">
        {children}
      </svg>
    </a>
  );
}

function FooterDetails({
  title,
  links,
}: {
  title: string;
  links: Array<{ label: string; href: string }>;
}) {
  return (
    <details className="group">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between text-sm font-bold text-white marker:content-none">
        {title}
        <ChevronDown className="size-4 text-white/60 transition-transform group-open:rotate-180" />
      </summary>
      <ul className="space-y-1 pb-4">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              href={link.href}
              className="flex min-h-11 items-center text-sm text-white/60 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
