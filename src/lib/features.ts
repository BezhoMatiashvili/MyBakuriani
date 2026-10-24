/**
 * Temporary product switches shared across surfaces.
 *
 * SALE_ZONE_PRICES_HIDDEN — the home page's sale mode ("ყიდვა") shows a row of
 * per-zone price-per-m² cards under the green hero. The owner asked to hide
 * them for now ("გასასწორებელი2.pdf", 2026-10-06: "ეს 4 ბლოკი დავაჰაიდოთ
 * დროებით"). The hero row, its spacers and the sm+ extras row are skipped;
 * the cards, the price aggregate and its query stay in place. Flip to false to
 * bring them back.
 */
export const SALE_ZONE_PRICES_HIDDEN = true;
