import { GA_MEASUREMENT_ID } from "@/lib/ga/config";
import { META_PIXEL_ID } from "@/lib/meta/config";
import type { LegalSubsection } from "./types";

// Privacy Policy subsection "Google Analytics" and its section 6 recipient
// line (C62). DRAFT wording of 2026-11-20, awaiting the owner's / legal
// sign-off before prod. Shown only on a build with
// NEXT_PUBLIC_GA_MEASUREMENT_ID; it is 5.2 after Meta's 5.1, else 5.1.

type GaPrivacy = {
  lastUpdated: string;
  subsection: LegalSubsection;
  recipient: string;
};

const GA_PRIVACY: Record<"ka" | "en" | "ru", GaPrivacy> = {
  ka: {
    lastUpdated: "ბოლო განახლება: 20.11.2026",
    subsection: {
      id: "cookies-google-analytics",
      title: "Google Analytics",
      body: "თქვენი თანხმობის შემთხვევაში (ქუქი-ფაილების ფანჯარაში „ვეთანხმები ყველას“) პლატფორმა იყენებს Google Ireland Limited-ის ანალიტიკურ სერვისს — Google Analytics 4-ს — საიტის გამოყენების სტატისტიკისთვის (მაგალითად, რომელ გვერდებს ნახულობენ ვიზიტორები და საიდან მოდიან). ამ მიზნით Google-ს გადაეცემა: მონახულებული საჯარო გვერდების მისამართი და სათაური (პერსონალური კოდისა და ძიების ტექსტის გარეშე); ექვსი მოქმედება — რეგისტრაციის დასრულება, კონტაქტის ნახვა, დარეკვის ან WhatsApp-ის ღილაკზე დაჭერა, განცხადების შენახვა, Smart Match მოთხოვნის შენახვა და ვაკანსიაზე განაცხადის გაგზავნა (მხოლოდ მოქმედების დასახელება და არხი, შევსებული მონაცემების, ტელეფონის ნომრისა და განცხადების იდენტიფიკატორის გარეშე); IP მისამართი (Google მას არ ინახავს და იყენებს მხოლოდ ქვეყნისა და ქალაქის დასადგენად), მოწყობილობისა და ბრაუზერის მონაცემები; ქუქი-ფაილები _ga და _ga_<ID> (ინახება 2 წელი). Google ამ მონაცემებს ამუშავებს MyBakuriani-ს დავალებით, Google-ის მონაცემთა დამუშავების პირობების შესაბამისად, მათ შორის ამერიკის შეერთებულ შტატებში; Google Analytics-ში მონაცემები ინახება 14 თვე. Google Signals, სარეკლამო პერსონალიზაცია და Google-ის სხვა პროდუქტებთან მონაცემების გაზიარება გამორთულია. პირადი კაბინეტის, ავტორიზაციისა და ადმინისტრაციული გვერდების მისამართი და სათაური Google-ს არ გადაეცემა.\n\nთანხმობის გაუქმება ნებისმიერ დროს შეგიძლიათ საიტის ქვედა ნაწილში ბმულით „ქუქი-ფაილები“: ამის შემდეგ Google-ს აღარაფერი გადაეცემა და ქუქი-ფაილები _ga იშლება.",
    },
    recipient:
      "Google Ireland Limited-ს (Google Analytics) — მხოლოდ ანალიტიკურ ქუქი-ფაილებზე თქვენი თანხმობის შემთხვევაში, საიტის გამოყენების სტატისტიკისთვის (იხ. პუნქტი 5);",
  },
  en: {
    lastUpdated: "Last updated: 20-11-2026",
    subsection: {
      id: "cookies-google-analytics",
      title: "Google Analytics",
      body: "With your consent (“Accept all” in the cookie window), the Platform uses Google Analytics 4, an analytics service of Google Ireland Limited, for usage statistics (for example, which pages visitors view and where they come from). For this, the following are sent to Google: the address and title of the public pages you visit (without personal codes or search text); six actions, completing a registration, revealing a contact, tapping the call or WhatsApp button, saving a listing, saving a Smart Match request and sending a job application (only the name of the action and the channel, never what you entered, a phone number or a listing identifier); your IP address (Google does not store it and uses it only to derive the country and city), device and browser details; and the _ga and _ga_<ID> cookies (kept for 2 years). Google processes this data on behalf of MyBakuriani under Google's data processing terms, including in the United States; the data is kept in Google Analytics for 14 months. Google signals, ad personalisation and sharing data with other Google products are turned off. The address and title of personal account, sign-in and administration pages are never sent to Google.\n\nYou can withdraw your consent at any time via “Cookie settings” at the bottom of the site: after that nothing more is sent to Google and the _ga cookies are deleted.",
    },
    recipient:
      "Google Ireland Limited (Google Analytics) — only with your consent to analytics cookies, for usage statistics (see section 5);",
  },
  ru: {
    lastUpdated: "Последнее обновление: 20.11.2026",
    subsection: {
      id: "cookies-google-analytics",
      title: "Google Analytics",
      body: "С вашего согласия («Принять все» в окне cookie) Платформа использует аналитический сервис Google Ireland Limited — Google Analytics 4 — для статистики использования сайта (например, какие страницы просматривают посетители и откуда они приходят). Для этого в Google передаются: адрес и заголовок посещённых публичных страниц (без персональных кодов и текста поиска); шесть действий — завершение регистрации, просмотр контакта, нажатие кнопки звонка или WhatsApp, сохранение объявления, сохранение запроса Smart Match и отправка отклика на вакансию (только название действия и канал, без введённых данных, номера телефона и идентификатора объявления); IP-адрес (Google его не хранит и использует только для определения страны и города), данные устройства и браузера; файлы cookie _ga и _ga_<ID> (хранятся 2 года). Google обрабатывает эти данные по поручению MyBakuriani в соответствии со своими условиями обработки данных, в том числе в Соединённых Штатах Америки; в Google Analytics данные хранятся 14 месяцев. Google Signals, персонализация рекламы и передача данных другим продуктам Google отключены. Адрес и заголовок страниц личного кабинета, входа и администрирования в Google не передаются.\n\nОтозвать согласие можно в любой момент по ссылке «Настройки cookie» внизу сайта: после этого в Google больше ничего не передаётся, а файлы cookie _ga удаляются.",
    },
    recipient:
      "Google Ireland Limited (Google Analytics) — только с вашего согласия на аналитические cookie, для статистики использования сайта (см. п. 5);",
  },
};

/** The locale's Google Analytics text, or null on a build without GA. */
export function googleAnalyticsPrivacy(
  locale: "ka" | "en" | "ru",
): GaPrivacy | null {
  if (!GA_MEASUREMENT_ID) return null;
  const text = GA_PRIVACY[locale];
  const number = META_PIXEL_ID ? "5.2" : "5.1";
  return {
    ...text,
    subsection: {
      ...text.subsection,
      title: `${number}. ${text.subsection.title ?? ""}`,
    },
  };
}
