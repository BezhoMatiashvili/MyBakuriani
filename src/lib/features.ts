/**
 * Temporary product switches shared across surfaces.
 *
 * RENTAL_REVIEWS_HIDDEN — rental (apartment/hotel) reviews are hidden at the
 * owner's request during QA (PDF reports of 2026-09-19 and 2026-09-26). It
 * hides the public review surfaces on the apartment and hotel detail pages
 * (header rating chip, reviews section, sidebar rating) and the renter
 * cabinet's "reviews" entry in the desktop sidebar and the mobile "more" sheet.
 * Guest review pages are unaffected. Flip to false to restore all of them at
 * once; the ask is explicitly temporary, so the code paths stay in place.
 */
export const RENTAL_REVIEWS_HIDDEN = true;

/**
 * SALE_ZONE_PRICES_HIDDEN — the home page's sale mode ("ყიდვა") shows a row of
 * per-zone price-per-m² cards under the green hero. The owner asked to hide
 * them for now ("გასასწორებელი2.pdf", 2026-10-06: "ეს 4 ბლოკი დავაჰაიდოთ
 * დროებით"). The hero row, its spacers and the sm+ extras row are skipped;
 * the cards, the price aggregate and its query stay in place. Flip to false to
 * bring them back.
 */
export const SALE_ZONE_PRICES_HIDDEN = true;
