import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blogPostingJsonLd,
  breadcrumbListJsonLd,
  hotelJsonLd,
  restaurantJsonLd,
  serializeJsonLd,
  siteJsonLd,
  touristDestinationJsonLd,
} from "../../src/lib/seo/jsonld.ts";

const SITE = "https://mybakuriani.ge";

test("serialization cannot break out of the script tag and round-trips", () => {
  const data = {
    name: `</script><script>alert(1)</script>`,
    note: "a\u2028b\u2029c",
  };
  const text = serializeJsonLd(data);
  assert.ok(!text.includes("<"), "no raw <");
  assert.ok(!text.includes("\u2028") && !text.includes("\u2029"));
  assert.deepEqual(JSON.parse(text), data);
  assert.deepEqual(JSON.parse(serializeJsonLd([data])), [data]);
});

test("a breadcrumb list is positioned 1..n in the order given", () => {
  const list = breadcrumbListJsonLd([
    { name: "Home", url: `${SITE}/` },
    { name: "Apartments", url: `${SITE}/apartments` },
    { name: "Flat", url: `${SITE}/apartments/x` },
  ]);
  assert.equal(list["@type"], "BreadcrumbList");
  assert.deepEqual(
    list.itemListElement.map((i) => [i.position, i.name, i.item]),
    [
      [1, "Home", `${SITE}/`],
      [2, "Apartments", `${SITE}/apartments`],
      [3, "Flat", `${SITE}/apartments/x`],
    ],
  );
});

// The home graph (C40): the Organization node exactly as before 2026-11-15,
// then the owner's SEO brief verbatim, the same on every locale.
const HOME_ORGANIZATION =
  '{"@type":"Organization","@id":"https://mybakuriani.ge/#organization","name":"MyBakuriani","url":"https://mybakuriani.ge/","logo":{"@type":"ImageObject","url":"https://mybakuriani.ge/android-chrome-512x512.png"},"contactPoint":{"@type":"ContactPoint","contactType":"customer support","telephone":"+995551261111","email":"info.mybakuriani@gmail.com"}}';

test("home markup is the organization, the brief's website and the resort", () => {
  const data = siteJsonLd({
    siteUrl: SITE,
    name: "MyBakuriani",
    logoUrl: `${SITE}/android-chrome-512x512.png`,
    telephone: "+995551261111",
    email: "info.mybakuriani@gmail.com",
  });
  const [org, site, destination] = data["@graph"];
  assert.equal(data["@graph"].length, 3);
  assert.equal(JSON.stringify(org), HOME_ORGANIZATION);
  assert.deepEqual(site, {
    "@type": "WebSite",
    "@id": `${SITE}/#website`,
    url: `${SITE}/`,
    name: "MyBakuriani.ge",
    alternateName: [
      "MyBakuriani",
      "ბაკურიანი",
      "Bakuriani Portal",
      "Бакуриани",
    ],
    inLanguage: ["ka-GE", "en-US", "ru-RU"],
    publisher: { "@id": `${SITE}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  });
  assert.deepEqual(destination, {
    "@type": "TouristDestination",
    name: "Bakuriani / ბაკურიანი / Бакуриани",
    description:
      "Ski and family resort in Georgia. Apartments, cottages, ski lifts, live cameras, and transport.",
    url: `${SITE}/`,
    geo: {
      "@type": "GeoCoordinates",
      latitude: "41.7497",
      longitude: "43.5325",
    },
    touristType: ["Skiers", "Families", "Mountain Lovers"],
  });
  // The placeholder stays literal: an encoded `%7B` would not be filled in.
  assert.ok(
    serializeJsonLd(data).includes(
      `"target":"${SITE}/search?q={search_term_string}"`,
    ),
  );
});

test("site markup invents no contact point and no social profiles", () => {
  const [org] = siteJsonLd({
    siteUrl: SITE,
    name: "MyBakuriani",
    logoUrl: `${SITE}/logo.png`,
  })["@graph"];
  assert.equal("contactPoint" in org, false);
  assert.equal("sameAs" in org, false);
});

test("a blog posting credits the author when known, the site otherwise", () => {
  const base = {
    url: `${SITE}/blog/x`,
    headline: "Winter in Bakuriani",
    inLanguage: "ka",
    publisherName: "MyBakuriani",
    publisherLogoUrl: `${SITE}/logo.png`,
  };
  const named = blogPostingJsonLd({ ...base, authorName: "Nino" });
  assert.deepEqual(named.author, { "@type": "Person", name: "Nino" });
  const anon = blogPostingJsonLd({ ...base, description: "  ", images: [] });
  assert.deepEqual(anon.author, {
    "@type": "Organization",
    name: "MyBakuriani",
  });
  for (const absent of ["description", "image", "datePublished"]) {
    assert.equal(absent in anon, false, `${absent} stays absent`);
  }
  assert.equal(named.mainEntityOfPage["@id"], `${SITE}/blog/x`);
});

test("a tourist destination states its region and invents no pin", () => {
  const url = `${SITE}/bakuriani`;
  const full = touristDestinationJsonLd({
    url,
    name: "Bakuriani",
    description: "  A mountain resort.  ",
    region: "Samtskhe-Javakheti",
    inLanguage: "en",
  });
  assert.equal(full["@type"], "TouristDestination");
  assert.equal(full["@id"], `${url}#destination`);
  assert.equal(full.description, "A mountain resort.");
  assert.deepEqual(full.containedInPlace, {
    "@type": "AdministrativeArea",
    name: "Samtskhe-Javakheti",
  });
  assert.equal("geo" in full, false);
  const bare = touristDestinationJsonLd({
    url,
    name: "Bakuriani",
    description: "x",
    inLanguage: "ka",
  });
  assert.equal("containedInPlace" in bare, false);
});

test("restaurant and hotel markup carry only facts that were supplied", () => {
  const place = {
    url: `${SITE}/food/1`,
    name: "Cafe",
    locality: "Bakuriani",
  };
  const bare = restaurantJsonLd(place);
  assert.equal(bare["@type"], "Restaurant");
  assert.deepEqual(bare.address, {
    "@type": "PostalAddress",
    addressLocality: "Bakuriani",
    addressCountry: "GE",
  });
  for (const absent of [
    "geo",
    "hasMenu",
    "servesCuisine",
    "image",
    "telephone",
  ]) {
    assert.equal(absent in bare, false, `${absent} stays absent`);
  }
  const full = restaurantJsonLd({
    ...place,
    geo: { lat: 41.75, lng: 43.53 },
    servesCuisine: "Georgian",
    menuUrl: `${SITE}/menu.pdf`,
    images: [`${SITE}/i.jpg`],
  });
  assert.deepEqual(full.geo, {
    "@type": "GeoCoordinates",
    latitude: 41.75,
    longitude: 43.53,
  });
  assert.equal(full.hasMenu, `${SITE}/menu.pdf`);
  assert.deepEqual(full.image, [`${SITE}/i.jpg`]);

  assert.equal("starRating" in hotelJsonLd({ ...place, starRating: 0 }), false);
  assert.deepEqual(hotelJsonLd({ ...place, starRating: 4 }).starRating, {
    "@type": "Rating",
    ratingValue: "4",
    bestRating: "5",
  });
});
