import "server-only";
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY } from "@/lib/site-contact";
import type { SupportCabinet } from "./plan";

// What the support assistant may tell users (C43). Every line restates the
// site's own behaviour; labels are quoted as the Georgian UI shows them.
// Prices are deliberately absent: they live in the database (pricing
// packages), and the assistant points to where the dashboard shows them.
// Re-check this file when a flow, a limit or a label it names changes.

const CABINET_LABELS: Record<SupportCabinet, string> = {
  guest: "the Guest cabinet (/dashboard/guest)",
  renter: 'the rentals cabinet "ბინები (გაქირავება)" (/dashboard/renter)',
  seller: 'the sales cabinet "ბინები (გაყიდვა)" (/dashboard/seller)',
  cleaner: "the Cleaner cabinet (/dashboard/cleaner)",
  food: "the Food / restaurant cabinet (/dashboard/food)",
  entertainment: "the Entertainment cabinet (/dashboard/entertainment)",
  transport: "the Transport cabinet (/dashboard/transport)",
  employment: "the Employment cabinet (/dashboard/employment)",
  services: "the Services / handyman cabinet (/dashboard/services)",
  admin: "the Admin panel (/dashboard/admin)",
  account: "the account pages (/dashboard/account)",
  create: "the listing forms (/create)",
  auth: "sign-in and registration (/auth)",
  public: "the public site (home page, listings, guides)",
};

export function cabinetLabel(cabinet: SupportCabinet): string {
  return CABINET_LABELS[cabinet];
}

const SHARED_MAP = `- /create "განცხადების დამატება" (orange button in the header, the cabinet switcher and dashboards): pick a category, then fill in its form.
- Cabinet switcher: the name chip at the top of the sidebar opens "სივრცის შეცვლა" with the user's cabinets, "შესვლის მეთოდები" (/dashboard/account), "მესაკუთრეობის დადასტურება" (/dashboard/account/ownership) and "სტუმრის რეჟიმი" (/dashboard/guest).
- Header bell: notifications from every cabinet; "ყველას ნახვა" opens /notifications.
- On phones the sidebar is replaced by a bottom bar with 3 tabs and "მეტი" (more).
- Public pages: /pricing (prices), /faq, /contact.`;

// Visitors outside the dashboards: the public site and sign-in.
const PUBLIC_SHARED_MAP = `- Header: "შესვლა" (sign in or register; /auth/login), "განცხადების დამატება" (add a listing; needs an account), the language switch, and once signed in "კაბინეტი" (the user's dashboard). On phones and tablets the header shows only "+" (add a listing) and the menu (☰): "შესვლა" and the category links are inside that menu.
- Public pages: /pricing (prices), /faq, /contact, /blog, /bakuriani (resort guide).`;

const SERVICE_MAP = (base: string, orders: string) =>
  `- ${base} "ჩემი კაბინეტი": the user's listings, "დაამატე სერვისი" (add a listing).
- ${base}/orders ${orders}
- ${base}/balance "ბალანსი და VIP": balance top-up, VIP / SUPER VIP, discount badge.
- ${base}/notifications "შეტყობინებები"; ${base}/parameters "პარამეტრები".`;

const CABINET_MAPS: Record<SupportCabinet, string> = {
  guest: `- /dashboard/guest "მთავარი გვერდი": Smart Match requests ("ახალი მოთხოვნა"), offers received, recently viewed listings.
- /dashboard/guest/bookings "მიღებული შეთავაზებები": Smart Match offers (phone tab "ჯავშნები").
- /dashboard/guest/favorites "რჩეულები": saved listings.
- /dashboard/guest/reviews "ისტორია": past services and reviews.
- /dashboard/guest/profile "პარამეტრები": name, phone, profile photo.`,
  renter: `- /dashboard/renter "ჩემი ბინები": membership status and "წევრობის გააქტიურება", stats, own rentals, "ახალი ბინა" (-> /create/rental).
- /dashboard/renter/listings "ჩემი ობიექტები" (phone tab): own rentals.
- /dashboard/renter/calendar "კალენდარი": manual bookings (double-click a free day), "ხელმისაწვდომობა", prices per day.
- /dashboard/renter/guests "სტუმრები": guest list and blacklist.
- /dashboard/renter/cleaners "დამლაგებლები": call a cleaner ("გამოძახება").
- /dashboard/renter/smart-match "შეთავაზების გაგზავნა": answer guests' Smart Match requests.
- /dashboard/renter/balance "ბალანსი და VIP": "ბალანსის შევსება", VIP / SUPER VIP, discount badge, SMS packages.
- /dashboard/sms "SMS ცენტრი": SMS automations to guests.
- /dashboard/renter/notifications "შეტყობინებები"; /dashboard/renter/profile "პარამეტრები".`,
  seller: `- /dashboard/seller "მთავარი პანელი": stats, "დამატება" (-> /create/sale).
- /dashboard/seller/leads "კლიენტები / ბაზა": sales board, drag leads between stages.
- /dashboard/seller/listings "ობიექტები და პროექტები": own sale listings, "ობიექტის დამატება".
- /dashboard/seller/organizations "ჩემი ორგანიზაციები": register a company or join an agency.
- /dashboard/seller/analytics "ანალიტიკა და უკუგება": views, phone reveals, favorites.
- /dashboard/seller/balance "ბალანსი და VIP"; /dashboard/seller/sms "ფასის კლების SMS" (when enabled).
- /dashboard/seller/notifications; /dashboard/seller/settings "პარამეტრები".`,
  cleaner: `- /dashboard/cleaner "მთავარი გვერდი": incoming call-outs, "დადასტურება" (accept) or "უარყოფა" (decline).
- /dashboard/cleaner/schedule "გრაფიკი": platform jobs and jobs the cleaner added.
- /dashboard/cleaner/parameters "პარამეტრები": profile, photo, "დასუფთავების სერვისის შექმნა" (-> /create/service).`,
  food: `- /dashboard/food "ჩემი კაბინეტი": restaurant stats.
- /dashboard/food/orders "ჩემი მენიუ (PDF)": the PDF menu, the menu link, discounts on single dishes; the menu file itself is changed in the restaurant's edit form.
- /dashboard/food/balance "ბალანსი და VIP"; /dashboard/food/notifications; /dashboard/food/parameters.`,
  entertainment: SERVICE_MAP(
    "/dashboard/entertainment",
    '"შეკვეთები": messages from customers.',
  ),
  transport: SERVICE_MAP(
    "/dashboard/transport",
    '"შეკვეთები": messages from customers.',
  ),
  employment: SERVICE_MAP(
    "/dashboard/employment",
    '"CV-ები": job applications with CVs.',
  ),
  services: SERVICE_MAP(
    "/dashboard/services",
    '"შეკვეთები": messages from customers.',
  ),
  admin: `- /dashboard/admin "მთავარი გვერდი".
- /dashboard/admin/verifications "ვერიფიკაციები": tabs for new listings, content changes and ownership requests.
- /dashboard/admin/memberships "საწევროს დადასტურება": approve renter memberships.
- /dashboard/admin/clients "მომხმარებლები": users (with search). Also "კომპანიები", "განცხადებები", "ლოგები", "შეფასებები".
- /dashboard/admin/settings "ტარიფები და პაკეტები": prices.
- "ლოკაციის ზონები", "სტატუს-ბარათები" (weather, lifts, road, cameras), "გზამკვლევი" (the /bakuriani resort guide's texts in ka/en/ru: a tab per guide page, a language switch, "შენახვა"), "ფინანსები", /dashboard/admin/payments "ბარათით გადახდები", /dashboard/admin/moderation "რეკლამები", "მასობრივი დაგზავნა", "პრომო კოდები", "ბანერები", /dashboard/admin/seo "სიახლეები" (blog).`,
  account: `- /dashboard/account "შესვლის მეთოდები": link Google ("Google-ის დაკავშირება"), the ownership card, "შეტყობინებების პარამეტრები" (marketing SMS / e-mail choices).
- /dashboard/account/ownership "მესაკუთრეობის დადასტურება": pick listings, upload an ID and a registry extract, "გაგზავნა დასადასტურებლად".`,
  public: `- / (home page): the search box with "გაქირავება" / "ყიდვა" (rent or buy), "ლოკაცია (ზონა)", dates, guests and "ძებნა"; live cards for weather, lifts, the road and cameras; "ცხელი შეთავაზებები" (discounts); sections for hotels, apartments and cottages, transport, services, entertainment, food, jobs and the blog.
- Listings by category: /apartments "ბინები", /hotels "სასტუმროები", /sales (property for sale), /food "კვება", /services "სერვისები", /entertainment "გართობა", /transport "ტრანსპორტი", /employment "დასაქმება"; /search searches everything with filters ("ფილტრები").
- A listing page: photos, price, facts, the map, "დარეკვა" (shows the owner's number; there is no online booking), WhatsApp, the heart "რჩეულებში დამატება" (needs an account), share. A job page has an apply button (CV optional).
- Guests looking for a place can also send a Smart Match request after signing in (/dashboard/guest, "ახალი მოთხოვნა"): owners answer with offers.`,
  auth: `- /auth/login "შესვლა / რეგისტრაცია": e-mail ("ელ. ფოსტა") and password ("პაროლი"), then "შესვლა"; "გაგრძელება Google-ით" signs in or registers with Google; "დაგავიწყდათ პაროლი?" -> /auth/forgot-password (a reset link is e-mailed).
- To register with e-mail: "არ გაქვთ ანგარიში? რეგისტრაცია", then e-mail, a password of at least 12 characters, "პაროლის დადასტურება" and "რეგისტრაცია". A confirmation link is e-mailed ("ბმულის ხელახლა გაგზავნა" resends it after 60 s; check the spam folder); the link opens a page with the button "ელ. ფოსტის დადასტურება".
- /auth/register, right after the first sign-in: "პროფილის შექმნა" (name* "სახელი", optional photo "ფოტოს ატვირთვა" and bio), "შემდეგი", then "აირჩიეთ როლი": სტუმარი (guest), გამქირავებელი (renter), გამყიდველი (seller), დამლაგებელი (cleaner), კვება, გართობა, ტრანსპორტი, დასაქმება, ხელოსანი (handyman); "დასრულება". A seller then picks "ინდივიდუალურად", "კომპანიის რეგისტრაცია" or "აგენტად მიბმა".`,
  create: `- /create "განცხადების დამატება": tiles "გაქირავება" (rental), "ყიდვა / გაყიდვა" (sale), "დასაქმება" (job), "სერვისები" (services), "ტრანსპორტი", "კვება" (food), "გართობა" (entertainment).
- /create/rental: a 5-step wizard, "გაგრძელება" moves on, the last step has "გამოქვეყნება": 1 "ძირითადი ინფორმაცია" (type*, zone*, cadastral code, description), 2 "ბინის დეტალები და მდებარეობა" (title*, map pin), 3 "კეთილმოწყობა და დეტალები" (area*, smoking*, pets*, meals* for hotels, rooms, guests, amenities), 4 "ფასი და ხელმისაწვდომობა" (price per night*, minimum days, availability), 5 "ფოტოები და კონტაქტი" (1-10 photos*, phone*, WhatsApp). A yellow notice "გაქირავების განცხადებისთვის საჭიროა სეზონური წევრობა" on step 1 means the user has no active membership (or it awaits approval): the rental cannot be published until a membership is active; its button "წევრობის შეძენა" (or "წევრობის სტატუსი") leads to /dashboard/renter.
- /create/sale, /create/food, /create/service, /create/transport, /create/entertainment, /create/employment: one page each, sections with a progress bar; required fields carry *.`,
};

export function siteMapFor(cabinet: SupportCabinet): string {
  const shared =
    cabinet === "public" || cabinet === "auth" ? PUBLIC_SHARED_MAP : SHARED_MAP;
  return `${CABINET_MAPS[cabinet]}\nEverywhere:\n${shared}`;
}

export const SITE_FACTS = `Publishing
- Every new listing is saved as pending ("მოლოდინში") and appears on the site only after an admin approves it. After publishing, the user is offered ownership verification right away ("მოგვიანებით" skips it).
- Editing a published listing's public fields sends the change to admin review; only one pending change per listing. Calendar availability, day prices and profile name/phone/photo change at once.
- Required fields are marked *. Titles: max 35 characters (rental, sale). Phone: 9 digits starting with 5.
- Photos per form: rental 1-10, sale 3-15, food 2-10, transport 1-10, entertainment 1-5, employment none. The first photo is the cover; photos can be dragged to reorder.

Uploads
- Listing photos: JPG, PNG or WEBP; HEIC/HEIF from iPhones is converted automatically. Each photo is resized to at most 2560 px and watermarked; the limit is 5 MB after that, so large originals usually pass. Errors say which files were skipped and why (wrong format, too many, too large, HEIC not converted: then use JPG/PNG).
- Profile photo (avatar): JPG or PNG, max 2 MB.
- Service listing profile photo: JPG, PNG or WEBP.
- Restaurant menu: a PDF up to 10 MB, or a link. The file is checked by its content: an empty or cut-off PDF is refused, so re-save or re-download it.
- CV for a job: optional, PDF or DOCX, max 10 MB, sent from the job's public page.
- Ownership documents: PDF, JPG, PNG, WebP or HEIC, max 10 MB each.
- Users cannot upload videos.

Rentals and membership
- Posting a rental needs an active seasonal membership (summer April-October, winter November-March). Buy it on "ჩემი ბინები" (/dashboard/renter) with "წევრობის გააქტიურება" (or "შემდეგი სეზონის წევრობა"), pay from the balance or by card, then "გადახდა და დასადასტურებლად გაგზავნა". It starts after admin approval; a rejected request is refunded to the balance.
- Rentals (hotels included) are visible on the site only while the owner's membership is active right now. When it lapses they disappear from the site at once but stay in the dashboard.

Promotion
- On "ბალანსი და VIP": SUPER VIP = top of search and the home page's SUPER VIP section; VIP = a badge; "ფასდაკლების ბეჯი" = a 1-90% discount the owner chooses, for a limited time, shown in hot offers. Standard VIP is not available while SUPER VIP is active; buying SUPER VIP ends a standard VIP.
- Restaurants discount single dishes on "ჩემი მენიუ (PDF)" instead.
- Prices: the package cards on "ბალანსი და VIP", the membership payment window and the public /pricing page.

Money and SMS
- "ბალანსის შევსება" (top up) is on every "ბალანსი და VIP" page. The balance is topped up by bank card only (no bank transfer, cash or other method); card details are entered on Keepz's payment page, never on MyBakuriani. Max 2000 ₾ per card payment. The balance updates after Keepz confirms the payment.
- SMS packages add credits; one message costs 1 credit even when it is split into several SMS. "SMS ცენტრი" sends automatic texts to guests: a check-in reminder the day before, a review request the day after check-out, a win-back invitation 90 days later.

Guests and bookings
- Smart Match: a guest creates a request ("ახალი მოთხოვნა": zone, dates, optionally guests and budget); owners with an active rental answer with offers on "შეთავაზების გაგზავნა". Max 5 open requests and 10 new ones per 24 hours.
- There is no online booking or online payment between guests and owners: guests call the owner and agree directly.
- Owners keep their own bookings on "კალენდარი": double-click a free day to add one; "ხელმისაწვდომობა" closes or opens dates; cancelled bookings go to history and can be restored.
- Cleaners: the owner presses "გამოძახება" on "დამლაგებლები", fills type, start time, address and note, then "გამოძახების გაგზავნა". The cleaner accepts or declines on their dashboard. A pending call-out can be cancelled directly; an accepted one needs "გაუქმების მოთხოვნა" and the cleaner's consent.

Trust and account
- Ownership verification ("მესაკუთრეობის დადასტურება", /dashboard/account/ownership): choose listings, upload an ID card or passport plus a registry extract (napr.gov.ge for property; the entrepreneurs' registry extract for services), then "გაგზავნა დასადასტურებლად". Only admins see the files, and they are deleted after the decision. Approved listings show "დადასტურებული მესაკუთრე". Changing the owner, cadastral code, address or map pin (for services: title, provider name or category) removes the badge; photo, description and price edits keep it.
- Sign-in is by e-mail and password or Google. Google can be linked on "შესვლის მეთოდები" (/dashboard/account) with "Google-ის დაკავშირება"; the last sign-in method cannot be removed.
- Notification settings: marketing SMS and e-mail can be switched off there; service messages cannot.
- A user can hold several cabinets (guest, rentals, sales, services...) and switches between them with the cabinet switcher.

Contact
- The site team: phone ${CONTACT_PHONE_DISPLAY}, e-mail ${CONTACT_EMAIL}, the /contact page; questions and answers on /faq.`;
