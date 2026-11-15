import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import GuideHeading from "@/components/guide/GuideHeading";
import GuideSection from "@/components/guide/GuideSection";
import LivePageEnd from "@/components/live/LivePageEnd";
import Breadcrumbs from "@/components/seo/Breadcrumbs";
import type { AppLocale } from "@/i18n/routing";
import { buildPageMetadata } from "@/lib/seo";
import { safeHttpsUrl } from "@/lib/security";
import { getLiveStatusCards } from "@/lib/status-cards/live";
import {
  LIVE_PAGE_PATHS,
  LIVE_PAGE_TIMEOUT_MS,
  isEmbeddableCamera,
} from "@/lib/status-cards/live-page";
import { pickLocalized } from "@/lib/status-cards/types";

const PATH = LIVE_PAGE_PATHS.cameras;

// ISR (C28): no cookies or headers. The status-card read (60 s cache) caps the
// effective interval at 60 s, as on the home page.
export const revalidate = 600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "LivePages" });
  return buildPageMetadata({
    locale,
    path: PATH,
    title: t("cameras.title"),
    description: t("cameras.description"),
  });
}

// The admin's camera streams as server HTML (C40): an rtsp.me stream is framed
// (the CSP frame-src host), any other https stream is linked out.
export default async function LiveCamerasPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const [t, tCards, tFooter, cards] = await Promise.all([
    getTranslations({ locale, namespace: "LivePages" }),
    getTranslations({ locale, namespace: "StatusCards" }),
    getTranslations({ locale, namespace: "Footer" }),
    getLiveStatusCards(LIVE_PAGE_TIMEOUT_MS),
  ]);
  const cameras = (cards.find((card) => card.id === "cameras")?.items ?? [])
    .map((item) => ({
      id: item.id,
      name: pickLocalized(item.label, locale),
      href: safeHttpsUrl(item.url),
    }))
    .filter(
      (camera): camera is { id: string; name: string; href: string } =>
        camera.href !== null,
    );

  return (
    <>
      <Breadcrumbs
        locale={locale}
        narrow
        items={[{ name: tFooter("liveCameras"), path: PATH }]}
      />
      <article className="mx-auto w-full max-w-3xl px-4 pt-4 sm:pt-6">
        <GuideHeading title={t("cameras.h1")} lead={t("cameras.lead")} />

        <GuideSection id="live-cameras" title={tCards("cameras")}>
          {cameras.length === 0 && <p>{t("unavailable")}</p>}
          {cameras.map((camera) => (
            <div key={camera.id}>
              <h3 className="text-[17px] font-bold leading-[24px] text-[#1E293B]">
                {camera.name}
              </h3>
              {isEmbeddableCamera(camera.href) ? (
                <div className="mt-3 aspect-video w-full overflow-hidden rounded-xl bg-black">
                  <iframe
                    src={camera.href}
                    title={camera.name}
                    loading="lazy"
                    className="size-full"
                    allow="autoplay; fullscreen"
                    allowFullScreen
                    referrerPolicy="no-referrer"
                  />
                </div>
              ) : (
                <a
                  href={camera.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center font-semibold text-[#2563EB] underline-offset-2 hover:underline"
                >
                  {t("cameras.openStream")}
                </a>
              )}
            </div>
          ))}
        </GuideSection>
      </article>
      <LivePageEnd locale={locale} page="cameras" />
    </>
  );
}
