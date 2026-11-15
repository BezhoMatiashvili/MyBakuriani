import { META_PIXEL_ID } from "@/lib/meta/config";
import type { LegalSubsection } from "./types";

// Privacy Policy section 5.1 "Meta Pixel" and its section 6 recipient line
// (C59). Shown only on a build with NEXT_PUBLIC_META_PIXEL_ID; without it the
// policy is the text it was before. Only the Pixel: no Conversions API, no
// hashed e-mail or phone, no payments.

type MetaPixelPrivacy = {
  lastUpdated: string;
  subsection: LegalSubsection;
  recipient: string;
};

const META_PIXEL_PRIVACY: Record<"ka" | "en" | "ru", MetaPixelPrivacy> = {
  ka: {
    lastUpdated: "ბოლო განახლება: 15.11.2026",
    subsection: {
      id: "cookies-meta",
      title: "5.1. Meta Pixel",
      body: "თქვენი თანხმობის შემთხვევაში (ქუქი-ფაილების ფანჯარაში „ვეთანხმები ყველას“) პლატფორმა იყენებს Meta Platforms Ireland Limited-ის (Facebook, Instagram) სარეკლამო ხელსაწყოს — Meta Pixel-ს — რეკლამის ეფექტიანობის გასაზომად და Facebook-სა და Instagram-ზე შესაბამისი რეკლამის საჩვენებლად. ამ მიზნით Meta-ს გადაეცემა: თქვენ მიერ მონახულებული საჯარო გვერდები და სამი მოქმედება — რეგისტრაციის დასრულება, ვაკანსიაზე განაცხადის გაგზავნა და Smart Match მოთხოვნის შენახვა (მხოლოდ მოქმედების დასახელება, შევსებული მონაცემების გარეშე); IP მისამართი და ბრაუზერის მონაცემები; ქუქი-ფაილები _fbp და _fbc (ინახება 90 დღე). Meta ამ მონაცემებს ამუშავებს როგორც MyBakuriani-სთვის აღნიშნული მომსახურების გასაწევად, ისე საკუთარი მიზნებისთვის, როგორც დამოუკიდებელი პასუხისმგებელი პირი, საკუთარი კონფიდენციალურობის პოლიტიკის შესაბამისად (facebook.com/privacy/policy), მათ შორის ამერიკის შეერთებულ შტატებში. ადმინისტრაციული გვერდებიდან და პერსონალური კოდის შემცველი ბმულებიდან (მაგალითად, პაროლის აღდგენის ბმული) Meta-ს არაფერი გადაეცემა.\n\nთანხმობის გაუქმება ნებისმიერ დროს შეგიძლიათ საიტის ქვედა ნაწილში ბმულით „ქუქი-ფაილები“: ამის შემდეგ Meta-ს აღარაფერი გადაეცემა და ქუქი-ფაილები _fbp და _fbc იშლება.",
    },
    recipient:
      "Meta Platforms Ireland Limited-ს (Facebook, Instagram) — მხოლოდ სარეკლამო ქუქი-ფაილებზე თქვენი თანხმობის შემთხვევაში, რეკლამის გასაზომად და პერსონალიზაციისთვის (იხ. პუნქტი 5.1);",
  },
  en: {
    lastUpdated: "Last updated: 15-11-2026",
    subsection: {
      id: "cookies-meta",
      title: "5.1. Meta Pixel",
      body: "With your consent (“Accept all” in the cookie window), the Platform uses the advertising tool of Meta Platforms Ireland Limited (Facebook, Instagram), the Meta Pixel, to measure its advertising and to show relevant ads on Facebook and Instagram. For this, the following are sent to Meta: the public pages you visit and three actions, completing a registration, sending a job application and saving a Smart Match request (only the name of the action, never what you entered); your IP address and browser details; and the _fbp and _fbc cookies (kept for 90 days). Meta processes this data both to provide this service to MyBakuriani and for its own purposes, as an independent controller, under its own privacy policy (facebook.com/privacy/policy), including in the United States. Nothing is sent to Meta from administration pages or from links that carry a personal code (such as a password reset link).\n\nYou can withdraw your consent at any time via “Cookie settings” at the bottom of the site: after that nothing more is sent to Meta and the _fbp and _fbc cookies are deleted.",
    },
    recipient:
      "Meta Platforms Ireland Limited (Facebook, Instagram) — only with your consent to advertising cookies, to measure and personalise advertising (see section 5.1);",
  },
  ru: {
    lastUpdated: "Последнее обновление: 15.11.2026",
    subsection: {
      id: "cookies-meta",
      title: "5.1. Meta Pixel",
      body: "С вашего согласия («Принять все» в окне cookie) Платформа использует рекламный инструмент Meta Platforms Ireland Limited (Facebook, Instagram) — Meta Pixel — для измерения эффективности рекламы и показа релевантной рекламы в Facebook и Instagram. Для этого в Meta передаются: посещённые вами публичные страницы и три действия — завершение регистрации, отправка отклика на вакансию и сохранение запроса Smart Match (только название действия, без введённых данных); IP-адрес и данные браузера; файлы cookie _fbp и _fbc (хранятся 90 дней). Meta обрабатывает эти данные как для оказания этой услуги MyBakuriani, так и в собственных целях — как самостоятельный ответственный за обработку — в соответствии со своей политикой конфиденциальности (facebook.com/privacy/policy), в том числе в Соединённых Штатах Америки. Со страниц администрирования и по ссылкам, содержащим персональный код (например, ссылка для сброса пароля), в Meta ничего не передаётся.\n\nОтозвать согласие можно в любой момент по ссылке «Настройки cookie» внизу сайта: после этого в Meta больше ничего не передаётся, а файлы cookie _fbp и _fbc удаляются.",
    },
    recipient:
      "Meta Platforms Ireland Limited (Facebook, Instagram) — только с вашего согласия на рекламные cookie, для измерения и персонализации рекламы (см. п. 5.1);",
  },
};

/** The locale's Meta Pixel text, or null on a build without the Pixel. */
export function metaPixelPrivacy(
  locale: "ka" | "en" | "ru",
): MetaPixelPrivacy | null {
  return META_PIXEL_ID ? META_PIXEL_PRIVACY[locale] : null;
}
