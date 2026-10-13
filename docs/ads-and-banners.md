# Ads & banners: placements and creative specs

What every banner and ad slot on mybakuriani.ge is, where it shows, and what image or video to upload for it.

_Checked against the code on 2026-10-13 (`staging` branch). Sources: `src/lib/banner-placements.ts` (the 12 placements), `src/components/banners/BannerSlotView.tsx` (how each one is drawn), `src/lib/ad-rate-card.ts` (rate card), `src/components/forms/MediaUploader.tsx` and `src/app/api/admin/media/sign-upload/route.ts` (upload limits), `next.config.ts` (image optimizer). Rotation and counting rules: `docs/contracts.md` C12, C46, C47. If a layout changes, re-check the sizes here._

_On-screen sizes are CSS pixels worked out from the layout code for a 1440 px wide desktop and a 375 px wide phone. Phones and retina laptops draw 2–3 screen pixels per CSS pixel, which is why the upload sizes are 2–3× the slot size._

---

## 1. Two kinds of creative

|                   | Editorial banner                                                                                                                                                              | Paid ad                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Admin page        | **ბანერები** (`/dashboard/admin/banners`)                                                                                                                                     | **რეკლამები** (`/dashboard/admin/moderation`)                                                                                                                            |
| Used for          | MyBakuriani's own notices and promos ("house" banners)                                                                                                                        | Third-party advertisers, sold per the rate card                                                                                                                          |
| Fields            | title, body text, button text + link (ღილაკის ტექსტი / ღილაკის ლინკი), colour tone, **one** image or video, optional video poster, start/end date-time, order (თანმიმდევრობა) | title (რეკლამის სათაური), click URL, **one required** image or video, placement, start/end day, SOV (ჩვენების წილი), priority, daily cap, advertiser (რეკლამის დამკვეთი) |
| Label on the site | none (a "PROMO" tag on promo cards)                                                                                                                                           | always **რეკლამა** (the site adds it)                                                                                                                                    |
| On click          | opens a detail window with the title, image, body and button (§9)                                                                                                             | opens the advertiser's URL in a new tab                                                                                                                                  |
| Colours           | 6 tones: ნარინჯისფერი, ქარვისფერი, ლურჯი, მწვანე, წითელი, მუქი ნაცრისფერი                                                                                                     | always neutral (dark slate)                                                                                                                                              |

**One ad = one placement = one file.** A campaign on three placements is three ads, each with its own upload. Two placements with the same shape (for example `home_hero` and `listing_top`) can use the same design, uploaded once per ad.

Stats for both kinds: **რეკლამის ანალიტიკა** (`/dashboard/admin/ad-analytics`).

---

## 2. The seven shapes to prepare

| Shape           | Ratio              | Upload (ideal)  | Minimum    | Used by                                              |
| --------------- | ------------------ | --------------- | ---------- | ---------------------------------------------------- |
| Wide banner     | 1160:180 (≈ 6.4:1) | **2320 × 360**  | 1160 × 180 | `home_hero`, `listing_top`, `footer_leaderboard`     |
| Phone strip     | 32:10              | **1280 × 400**  | 960 × 300  | `mobile_strip`                                       |
| Portrait        | 4:5                | **1080 × 1350** | 800 × 1000 | `detail_sidebar`                                     |
| Square card     | 1:1                | **1080 × 1080** | 720 × 720  | `listing_grid`                                       |
| Landscape       | 16:9               | **1280 × 720**  | 640 × 360  | `home_promo`, `home_between_sections`, `blog_inline` |
| Small icon      | 1:1                | **256 × 256**   | 128 × 128  | `header_strip`, `home_top_strip` (40 px thumbnail)   |
| Small thumbnail | 4:3                | **320 × 240**   | 192 × 144  | `sticky_bottom` (ads only)                           |

Upload in exactly these ratios. The site always **fills** the slot: a file in another ratio is cropped from its centre, never stretched or letter-boxed. Several slots are also cropped further on phones (§7).

---

## 3. All 12 placements

| Admin label (placement id)                           | Where it shows                                                                                                                                             | Style       | On screen: desktop · phone (375 px)                                                          | Upload          | Media      |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------- | --------------- | ---------- |
| მთავარი — ჰერო ბანერი (`home_hero`)                  | Home page (rent and sale view), after the search block, the status cards and the top info strip. Seen after a short scroll                                 | Wide banner | 1160 × 180 · 343 × 110, sides cut off                                                        | 2320 × 360      | Required   |
| კატალოგი — ბადის ზემოთ (`listing_top`)               | Top of the listing grid on apartments, hotels, sales, food, services, entertainment, transport, employment, search and blog. Hidden when the list is empty | Wide banner | ≈ 1128 × 175 (1248 × 194 on /blog, ≈ 936 × 145 on /search) · 343 × 110, sides cut off        | 2320 × 360      | Required   |
| ქვედა ბანერი (ყველა გვერდზე) (`footer_leaderboard`)  | Every public page, just above the footer                                                                                                                   | Wide banner | 1160 × 180 · 343 × 110, sides cut off                                                        | 2320 × 360      | Required   |
| მობილური — ზოლი (`mobile_strip`)                     | **Phones only** (screens under 768 px): every public page, under the navigation                                                                            | Phone strip | not shown · 343 × 107                                                                        | 1280 × 400      | Required   |
| დეტალური გვერდი — გვერდითი ბანერი (`detail_sidebar`) | Detail pages of apartments, hotels, sales, food and jobs: the side column on desktop, lower on the page on phones and tablets                              | Portrait    | 384 × 480 (395 × 493 food, 320 × 400 jobs) · 343 × 429                                       | 1080 × 1350     | Required   |
| კატალოგი — ბარათებს შორის (`listing_grid`)           | Inside the same listing grids: after the 8th listing (and the 16th), at most 2 per page. A page with 1–7 listings gets one after the last                  | Square card | 360 × 360 (400 on /blog, ≈ 296 on /search) · 343 × 343 (**166 × 166** in the food list)      | 1080 × 1080     | Required   |
| მთავარი — პრომო ბარათი (`home_promo`)                | Home, rent view only: the „რეკომენდებული სერვისები" block under „განთავსების ობიექტები"                                                                    | Promo card  | image 320 × 180 · image ≈ 128 × 128                                                          | 1280 × 720      | Optional\* |
| მთავარი — სექციებს შორის (`home_between_sections`)   | Home, rent view only: between „ცხელი შეთავაზებები" and „განთავსების ობიექტები"                                                                             | Promo card  | image 320 × 180 · image 343 × 180                                                            | 1280 × 720      | Optional\* |
| ბლოგი — სტატიის შიგნით (`blog_inline`)               | Blog post page, after the article text                                                                                                                     | Promo card  | image **736 × 180** · image 343 × 180                                                        | 1280 × 720      | Optional\* |
| ზედა ზოლი (ყველა გვერდზე) (`header_strip`)           | Every public page, at the top under the navigation                                                                                                         | Info strip  | text bar up to 1160 wide; the image is a 40 × 40 icon                                        | 256 × 256       | Optional\* |
| მთავარი — ზედა ინფო ზოლი (`home_top_strip`)          | Home (both views): under the search block and status cards, above the hero banner                                                                          | Info strip  | as above                                                                                     | 256 × 256       | Optional\* |
| მიკრული ზოლი (ყველა გვერდზე) (`sticky_bottom`)       | Every public page: a bar pinned to the bottom of the screen. Visitors can close it                                                                         | Sticky bar  | ad: 400–720 px wide bar with a 64 × 48 thumbnail (full width on phones); editorial: no image | 320 × 240 (ads) | Optional\* |

\* An editorial banner can be text-only here. The ad form always asks for a file, whatever the placement.

- "Public pages" means everything except sign-in and registration (`/auth`), dashboards, `/create` and checkout. Those show no banners.
- On wider phones every phone size above grows in proportion.
- The rate card prices 7 placements: `home_hero`, `listing_top`, `home_promo`, `listing_grid`, `detail_sidebar`, `mobile_strip` and `blog_inline` (Admin → რეკლამები → „ფასები და პაკეტები"). The other five have no price and are normally used for editorial banners; an ad can still be booked there.

---

## 4. Upload rules (enforced by the site)

|               | Images              | Videos    | Video poster (editorial banners only) |
| ------------- | ------------------- | --------- | ------------------------------------- |
| Formats       | JPG, PNG, WebP, GIF | MP4, WebM | JPG, PNG, WebP                        |
| Max file size | 5 MB                | 50 MB     | 5 MB                                  |

- **Not accepted:** SVG, AVIF, HEIC (iPhone photos: export them as JPG first), PDF. Files must be uploaded through the form: there is no field to paste a link.
- A banner or ad holds **one** media file, an image **or** a video. Uploading a video replaces the image.
- Wide banner, phone strip, portrait and square-card placements cannot work without media. An editorial banner there is refused on save (`media_required`); an ad without media there is never shown.
- The ad form refuses to save an ad without a file, on every placement.

---

## 5. What the site does with your file, and how to keep it sharp

- **Images** are resized for each screen and re-encoded as **WebP at quality 75**, never wider than **1920 px**. Upload the sizes in §2. Smaller files look soft on phones and retina screens; much larger ones gain nothing.
- Each size is generated on its first request and then cached for a year. That first load can take 1–2 s on our small server; a smaller original makes it faster.
- **Animated GIFs are not resized or compressed.** Every visitor downloads the whole file, even where it shows as a 40 px icon. Use an MP4 for animation (§8). If you must use a GIF, keep it under ~1 MB.
- **Videos and video posters** are served exactly as uploaded: no resizing, no compression.
- Every upload gets a new file name, so a replaced image never shows a stale cached copy.

Quality tips:

- Export in **sRGB**. Print files in CMYK can shift colour.
- Photos: JPG at 85–90 % quality. Flat graphics with text and logos: PNG, or a high-quality JPG or WebP. The site's WebP 75 softens hairlines and very small type.
- Aim for **under 500 KB** per image (a few hundred KB is typical at these sizes). The 5 MB limit is a ceiling, not a target.
- Use a solid background. Transparent areas show the card's background colour (very light grey for ads).
- Don't add rounded corners, a border, a drop shadow or your own "რეკლამა"/"Ad" label. The site adds rounded corners (16–24 px), a 1 px border and, for ads, the label.
- **Text size.** Every word should be at least ~13 px tall on the smallest screen it appears on. On the upload canvas that means at least:

  | Shape                   | Smallest font on the canvas | Why                                                  |
  | ----------------------- | --------------------------- | ---------------------------------------------------- |
  | Wide banner 2320 × 360  | 44 px (22 px at 1160 × 180) | phones show it only 110 px tall                      |
  | Phone strip 1280 × 400  | 52 px                       | ≈ 328 px wide on a 360 px phone                      |
  | Portrait 1080 × 1350    | 48 px                       | ≈ 300 px wide on a 1024 px tablet                    |
  | Square card 1080 × 1080 | 90 px                       | 166 px wide in the two-column food list on phones    |
  | Landscape 1280 × 720    | no text                     | the card prints the title, body and button beside it |

---

## 6. What the site draws on top of your image

On every wide banner, phone strip, portrait and square card:

```
+------------------------------------------------------+
|                                          [  AD  ]    |  <- "რეკლამა" label (ads only)
|                                                      |
|        your visual: logo, headline, offer            |
|                                                      |
|::::::::::::::::::::::::::::::::::::::::::::::::::::::|  <- dark fade, bottom ~60 px
|  Title typed in the admin form (white)          (o)  |  <- title text; (o) = expand button (videos)
+------------------------------------------------------+
```

- **The title you type in the form is always printed** over the bottom-left of the image, in white bold (13 px on phones, 15 px on desktop), on a dark fade about 60 px tall. It can't be turned off. Keep that band free of your own text and keep the title short: one line on a phone holds about 35 characters, and on the 166 px food-list card about 15.
- The fade covers about a third of a desktop wide banner, but **more than half** of the phone versions (the wide banner is 110 px tall on a phone, the phone strip about 107 px).
- Ads get a **რეკლამა** label in the top-right corner, about 80 × 20 px, 8 px from the edges.
- Videos get a round 36 px expand button in the bottom-right corner.

Promo cards have no title overlay: a **PROMO** (editorial) or **რეკლამა** (ad) tag sits in the top-left of the image, and the title, body and button are printed beside or under it.

---

## 7. Placement details

### 7.1 Wide banners — `home_hero`, `listing_top`, `footer_leaderboard`

- **Desktop:** 1160 × 180. `listing_top` takes the width of the grid: about 1128 × 175 on most catalog pages, 1248 × 194 on /blog, about 936 × 145 on /search (the filter column sits beside it).
- **Tablet:** the whole banner, scaled down.
- **Phone:** 343 × 110. The box never gets shorter than 110 px, so the banner is enlarged to that height and **its left and right sides are cut off**: a 375 px phone shows the middle ~48 % of the width, a 360 px phone ~46 %.
- **Upload 2320 × 360** (design at 1160 × 180, export at 2×). Minimum 1160 × 180.
- Put the logo, headline and offer inside the middle ~540 px of the 1160 px width (x ≈ 310–850; on the 2320 export x ≈ 620–1700), above the title band. In ads, also leave the top-right corner of that zone free: on phones the label lands there.

```
0             310                                      850        1160
+-------------+----------------------------------------+-------------+  y = 0
|             |                               [ AD ]   |   [ AD ]    |  <- label (ads only): phone | desktop
|  cut off    |  PHONE-SAFE ZONE                       |  cut off    |
|  on phones  |  logo + headline + offer               |  on phones  |
|             |                                        |             |  y ~ 125
|:::::::::::::|:: title band (site prints the title) ::|:::::::::::::|
+-------------+----------------------------------------+-------------+  y = 180
```

(coordinates on the 1160 × 180 design; double them for the 2320 × 360 export)

- Video works here (§8): 1920 × 298 MP4, same safe zone.
- An editorial wide banner opens the detail window on click, where only the middle ~28 % of the image shows (§9).

### 7.2 Phone strip — `mobile_strip`

- Drawn **only on screens under 768 px**; desktop and tablet visitors never see it.
- Full width minus 16 px on each side, ratio 32:10: 343 × 107 on a 375 px phone, 358 × 112 at 390 px, 398 × 124 at 430 px. The box keeps its ratio, so nothing is cropped.
- **Upload 1280 × 400.** Minimum 960 × 300.
- The title band is large here: the fade starts about 40 % down (y ≈ 165 on the 1280 × 400 canvas) and the title text fills the bottom ~115 px. In ads the label covers the top-right ~300 × 100 px. Put the logo and a 2–4 word headline in the upper part, on the left or centre.
- On a phone at most **2** placements show an ad per page view. The first two drawn win, so on the home page the strip often gives way to `home_hero` and `home_promo` ads (§10).
- Video works here: 1280 × 400 MP4, under ~2 MB.

### 7.3 Detail sidebar — `detail_sidebar`

- Pages: apartment, hotel, sale, food and job detail pages (not services, entertainment or transport).
- **Desktop:** the right-hand column: 384 × 480 on apartments, hotels and sales; 395 × 493 on food; 320 × 400 on jobs.
- **Phones and tablets (under 1024 px):** full page width, lower on the page: 343 × 429 on a 375 px phone, up to about 990 × 1240 on a tablet.
- The box keeps 4:5 at every size, so nothing is cropped.
- **Upload 1080 × 1350** (the usual Instagram portrait size). Minimum 800 × 1000.
- With several ads booked, the sidebar re-draws every 45 s while the page is open.
- Video works here: 1080 × 1350 MP4, under ~3 MB.

### 7.4 Sponsored card among listings — `listing_grid`

- A square in one cell of the listing grid: 360 × 360 on desktop (3 columns), 400 × 400 on /blog, about 296 on /search; 2 columns on tablets (about 360–490 px); one column on phones (343 × 343). Exception: the **food list shows 2 columns on phones, so the card is only 166 × 166 there**.
- After the 8th listing and the 16th, at most 2 per page. A page with 1–7 listings gets one card after the last. The second card never repeats the first one's creative.
- Ads here take turns (no share of voice); positions no ad holds show an editorial banner booked here, if any.
- **Upload 1080 × 1080.** Minimum 720 × 720.
- Design for 166 px: one big logo, one short line, font at least 90 px on the canvas, and a title of about 15 characters.
- Video works here: 1080 × 1080 MP4, under ~3 MB.

### 7.5 Promo cards — `home_promo`, `home_between_sections`, `blog_inline`

The image is one part of an HTML card; the title, body and button are text next to or under it.

```
Desktop (home_promo, home_between_sections):
+--------------------+--------------------------------------------------+
|[PROMO]             |                                                  |
|                    |  Title (22 px)                   ( Button )      |
|   image 320x180    |  Body text (13 px)                               |
|                    |                                                  |
+--------------------+--------------------------------------------------+

Phone, home_promo (compact):
+-----------+------------------------------+
|[PROMO]    | Title (1 line)               |
| image     | Body (2 lines)               |
| ~128x128  | ( Button )                   |
+-----------+------------------------------+

Phone (home_between_sections), and blog_inline at every width:
+------------------------------------------+
|[PROMO]                                   |
|     image: full width x 180 px           |
|                                          |
+------------------------------------------+
| Title                                    |
| Body text                                |
| ( Button )                               |
+------------------------------------------+
```

| Placement               | Desktop                         | Tablet                           | Phone                       |
| ----------------------- | ------------------------------- | -------------------------------- | --------------------------- |
| `home_promo`            | image 320 × 180, text beside it | image 320 wide × the card height | image ≈ 128 × 128 (compact) |
| `home_between_sections` | image 320 × 180, text beside it | image 320 wide × the card height | image on top, 343 × 180     |
| `blog_inline`           | image on top, **736 × 180**     | image on top, full width × 180   | image on top, 343 × 180     |

- **Upload 1280 × 720** (16:9) with the subject in the centre and **no text in the image**. Minimum 640 × 360.
- What each crop keeps of a 16:9 image:
  - `home_promo` on phones: the middle ~56 % of the width (a square).
  - `blog_inline` on desktop: the middle ~43 % of the height (a 4:1 band).
  - Everywhere else: nearly all of it.
  - One image that survives every crop keeps its subject inside the centre ~720 × 310 px of the 1280 × 720 file.
- Card text: title 22 px (15 px and one line in the compact phone card), body 13 px (11 px and two lines compact), button. **An ad shows only its title**: no body or button, and the whole card links to the advertiser.
- A video can replace the image (same crops).
- Several editorial banners stack here, one under another; at most one ad is added per page view.
- `home_promo` shows its „რეკომენდებული სერვისები" heading only while an editorial banner is live there; an ad alone shows without the heading.

### 7.6 Info strips — `header_strip`, `home_top_strip`

```
+----------------------------------------------------------------------------+
| [40x40]  Title - body text ...                     ( Button )    [ AD ]    |
+----------------------------------------------------------------------------+
```

- A text bar up to 1160 px wide: an optional small image (40 × 40, rounded), the bold title, a dash and the body, and an optional button on the right. On phones the button wraps under the text.
- No video in the bar: a video shows only in the detail window.
- **If you add an image:** a square logo or icon, 256 × 256 (minimum 128 × 128), centred, no text (it is 40 px on screen). Without an image an editorial strip shows an "i" icon.
- **Ads** here are text: the title and the რეკლამა label, plus the file as the 40 px thumbnail. Upload a square logo, not a banner.
- **Editorial** strips: the same image also appears large in the detail window, cropped to 16:9, so a square logo loses its top and bottom there. If the window matters, use a 16:9 photo with the subject centred (the bar shows its middle square).
- Several editorial strips stack; at most one ad is added per page view.

### 7.7 Sticky bar — `sticky_bottom`

```
+----------------------------------------------------------+
| [ 64x48 ]  [ AD ]                                   ( X )|
| [ thumb ]  Title of the ad  ->                           |
+----------------------------------------------------------+
```

- Pinned to the bottom of the screen on every public page. Each visitor can close it, and that device remembers. On detail pages on phones it sits above the call/booking bar.
- **Ad:** a compact bar, full width on phones and 400–720 px wide on desktop, with a **64 × 48 thumbnail** (4:3), the რეკლამა label above the title, an arrow (desktop) and the close button. Upload a 4:3 logo or product photo on a plain background, **320 × 240** (minimum 192 × 144). A wide banner cropped to 4:3 at 64 px is unreadable. A video ad shows no thumbnail.
- The ad title is up to 2 lines on phones and 1 line on desktop: keep it under ~60 characters.
- **Editorial banner:** no image in the bar at all, only an "!" icon, the bold title, a dash and the body, and an optional button; up to 1160 px wide and 64–72 px tall. An image or video appears only in the detail window (16:9 crop, §9).

---

## 8. Video

- **Plays in:** wide banners, the phone strip, the sidebar, the square card, the promo-card image and the detail window. **Not** in info strips or the sticky bar.
- **How it plays:** starts by itself, muted, looping, inline. The whole file downloads once the slot loads. Sound is never heard in the slot (only if a visitor opens the detail window and presses play).
- **Format:** MP4 (H.264). It plays in every browser; WebM does not play on some older iPhones.
- **Size:** the shape from §2, at most 1920 px wide: wide 1920 × 298, strip 1280 × 400, portrait 1080 × 1350, square 1080 × 1080, landscape 1280 × 720.
- **Length and weight:** 6–15 s, a seamless loop, no audio track, **under ~3 MB** (under ~2 MB for the phone strip). 50 MB is only the hard limit: every visitor downloads the whole file, many of them on mobile data.
- **First frame:** ads have no poster field, so the box stays empty until the video loads, and the first frame must work on its own. For editorial videos upload a poster (JPG or WebP, same ratio, under ~200 KB; the site does not compress it).
- Keep the bottom-right corner clear for the expand button.

Example export with ffmpeg (replace `W` and `H` with the target size, e.g. `1920` and `298`):

```bash
ffmpeg -i input.mov -an -t 12 \
  -vf "scale=W:H:force_original_aspect_ratio=increase,crop=W:H,fps=30" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 27 -preset slow \
  -movflags +faststart banner.mp4
```

`-an` drops the audio, `-movflags +faststart` lets playback start before the file has fully downloaded. Raise `-crf` (28–30) if the file is still over budget.

---

## 9. The detail window (editorial banners only)

Clicking an editorial banner, in any placement, opens a window with the title, the image, the body text, the dates (if set) and the button. The image there is **cropped to 16:9** (about 608 × 342 on desktop, 303 × 170 on a 375 px phone). A video plays whole, with controls.

| Uploaded shape    | What the 16:9 window keeps     |
| ----------------- | ------------------------------ |
| Wide 1160:180     | the middle ~28 % of the width  |
| Phone strip 32:10 | the middle ~56 % of the width  |
| Portrait 4:5      | the middle ~45 % of the height |
| Square 1:1        | the middle ~56 % of the height |
| Landscape 16:9    | all of it                      |

Put the message in the title, body and button fields (they are text in the window) and keep a recognisable visual in the centre of the image. Ads don't open this window: a click goes straight to the advertiser. The one exception is a video ad's expand button.

---

## 10. How ads are shown

Short version; the full rules are in `docs/contracts.md` C12 and C47.

- **One creative per page view** on wide banners, the phone strip, the sidebar, the square card and the sticky bar. Info strips and promo cards stack every live editorial banner and add at most one ad per page view.
- **Share of voice (SOV):** 25 % ≈ every 4th page load, 50 % ≈ every 2nd, 100 % = every load and no other ad. A placement can't be booked over 100 % in total for overlapping dates (4 × 25 %, 2 × 50 % or 1 × 100 %). The square card has no SOV: its ads take turns.
- The share nobody bought goes to the editorial banners of that placement; with none, the slot stays empty.
- **Priority** (1–10) decides which ad gets its share first.
- **Daily cap per device** (form default 3, empty = no cap) counts every placement of that ad together, so moving an ad doesn't reset it.
- **Phones:** at most 2 placements show an ad per page view.
- **The admin's own browser** is never capped and never counted. To check an ad on the real site, use **საიტზე ნახვა** on its card: it opens the page with that ad forced into its slot and outlined in orange. The form's preview (დესკტოპი / მობილური) always shows the ad, whatever the rotation.
- Changes reach visitors within about 2 minutes.
- Ad dates are whole days in Tbilisi time (start 00:00, end 23:59).

---

## 11. Files to prepare per package

| Package         | Placements (SOV)                                                    | Files to prepare                                                                                                  |
| --------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| START           | `home_promo` 25 % + `mobile_strip` 25 %                             | 1280 × 720 + 1280 × 400                                                                                           |
| GROWTH          | `listing_top` 25 % + `detail_sidebar` 25 %                          | 2320 × 360 + 1080 × 1350                                                                                          |
| PREMIUM         | `home_hero` 50 % + `listing_top` 25 %                               | 2320 × 360 (one design, uploaded to both ads)                                                                     |
| DOMINANCE       | `home_hero` 100 % + `listing_top` 50 % + `mobile_strip` 50 %        | 2320 × 360 (both wide ads) + 1280 × 400                                                                           |
| SEASON TAKEOVER | `home_hero` + `listing_top` + `mobile_strip` + one native placement | 2320 × 360 (both wide ads) + 1280 × 400 + the native one: 1080 × 1080 (sponsored card) or 1280 × 720 (promo card) |

The media plan doesn't name SEASON TAKEOVER's native placement; agree it with the advertiser.

---

## 12. Before you upload

- [ ] Right ratio for the placement (§2), exported at the "ideal" size.
- [ ] Wide banners: logo and headline inside the middle ~540 px of the 1160 px width; that's all a phone shows.
- [ ] Nothing important in the bottom title band or, for ads, the top-right label corner.
- [ ] Text big enough (§5); no text in promo-card images.
- [ ] No own "Ad" label, rounded corners or border.
- [ ] JPG/PNG/WebP under ~500 KB; MP4 under ~3 MB; no animated GIF over ~1 MB.
- [ ] A short title: it is printed on the image.
- [ ] Checked the form's preview in both დესკტოპი and მობილური; for ads, also საიტზე ნახვა.

---

## 13. Known mismatches (for the team)

1. **`blog_inline` is wider than sold.** The rate card says 320 × 180, and the admin desktop preview shows a 320 × 180 image beside the text. On a real blog post the article column is 736 px, below the card's 768 px breakpoint, so the card always uses its stacked layout and the image is **736 × 180**. A 16:9 image loses more than half its height there.
2. **The editorial detail window crops every image to 16:9** (§9), so a wide or portrait house banner shows only its centre there.
3. **The admin forms give no size guidance.** They show only the ratio ("1160×180", "320×400", "1×1", "320×180", "320×100"; "—" for the strips and the sticky bar), with no upload size, safe zone or text-size advice. This document fills that gap.
4. **The rate card calls the phone strip "Responsive"**; the site draws a fixed 32:10 box (320 × 100 at the base size).
5. **Ads have no video poster field**, so a video ad is an empty box until its video loads.
