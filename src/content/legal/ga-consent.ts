// The cookie banner's description on a build with Google Analytics (C62):
// DRAFT wording of 2026-11-20, awaiting the owner's / legal sign-off before
// prod. WITH_META replaces META_CONSENT_DESCRIPTION when the Pixel is on too;
// GA_ONLY replaces CookieConsent.description. A build without
// NEXT_PUBLIC_GA_MEASUREMENT_ID keeps the earlier texts unchanged.
type Text = Record<"ka" | "en" | "ru", string>;

export const GA_WITH_META_CONSENT_DESCRIPTION: Text = {
  ka: "აუცილებელ ქუქი-ფაილებს ვიყენებთ საიტის მუშაობისა და ავტორიზაციისთვის. თქვენი თანხმობით ვიყენებთ ანალიტიკურ ქუქი-ფაილებს, მათ შორის Google Analytics-ს, გამოყენების სტატისტიკისთვის და Meta-ს (Facebook, Instagram) სარეკლამო ქუქი-ფაილებსა და ხელსაწყოებს რეკლამის გაზომვისა და პერსონალიზაციისთვის. თანხმობის გაუქმება ნებისმიერ დროს შეგიძლიათ ბმულით „ქუქი-ფაილები“ საიტის ქვედა ნაწილში.",
  en: "We use essential cookies to run the site and keep you signed in. With your consent we also use analytics cookies, including Google Analytics, for usage statistics, and Meta (Facebook, Instagram) advertising cookies and tools to measure and personalise ads. You can withdraw your consent at any time via “Cookie settings” at the bottom of the site.",
  ru: "Необходимые файлы cookie обеспечивают работу сайта и авторизацию. С вашего согласия мы также используем аналитические cookie, в том числе Google Analytics, для статистики использования, а рекламные cookie и инструменты Meta (Facebook, Instagram) — для измерения и персонализации рекламы. Отозвать согласие можно в любой момент по ссылке «Настройки cookie» внизу сайта.",
};

export const GA_ONLY_CONSENT_DESCRIPTION: Text = {
  ka: "აუცილებელ ქუქი-ფაილებს ვიყენებთ საიტის მუშაობისა და ავტორიზაციისთვის. თქვენი თანხმობით ვიყენებთ ანალიტიკურ ქუქი-ფაილებს, მათ შორის Google Analytics-ს, გამოყენების სტატისტიკისთვის. თანხმობის გაუქმება ნებისმიერ დროს შეგიძლიათ ბმულით „ქუქი-ფაილები“ საიტის ქვედა ნაწილში.",
  en: "We use essential cookies to run the site and keep you signed in. With your consent we also use analytics cookies, including Google Analytics, for usage statistics. You can withdraw your consent at any time via “Cookie settings” at the bottom of the site.",
  ru: "Необходимые файлы cookie обеспечивают работу сайта и авторизацию. С вашего согласия мы также используем аналитические cookie, в том числе Google Analytics, для статистики использования. Отозвать согласие можно в любой момент по ссылке «Настройки cookie» внизу сайта.",
};
