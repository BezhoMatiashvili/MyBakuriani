// Display names of the Georgian cities the GeoIP table stores (C49). The table
// keeps DB-IP's English names (scripts/geoip/build-geoip.mjs), which English
// pages show as they are; Georgian and Russian pages use these. A city DB-IP
// adds later simply shows its English name until it is listed here. Country
// names: countryNames below. Pure (no imports) so scripts/unit can load it.

const CITY_NAMES: Record<string, { ka: string; ru: string }> = {
  Abasha: { ka: "აბაშა", ru: "Абаша" },
  Akhaldaba: { ka: "ახალდაბა", ru: "Ахалдаба" },
  Akhaltsikhe: { ka: "ახალციხე", ru: "Ахалцихе" },
  Akhmeta: { ka: "ახმეტა", ru: "Ахмета" },
  Alakhadzi: { ka: "ალახაძი", ru: "Алахадзы" },
  Arakichi: { ka: "არაკიჩი", ru: "Аракичи" },
  Bagdati: { ka: "ბაღდათი", ru: "Багдати" },
  Bakuriani: { ka: "ბაკურიანი", ru: "Бакуриани" },
  Batumi: { ka: "ბათუმი", ru: "Батуми" },
  Besleti: { ka: "ბესლეთი", ru: "Беслети" },
  Bolnisi: { ka: "ბოლნისი", ru: "Болниси" },
  Borjomi: { ka: "ბორჯომი", ru: "Боржоми" },
  "Didi Lilo": { ka: "დიდი ლილო", ru: "Диди Лило" },
  Gagra: { ka: "გაგრა", ru: "Гагра" },
  Gardabani: { ka: "გარდაბანი", ru: "Гардабани" },
  Gori: { ka: "გორი", ru: "Гори" },
  Gudauri: { ka: "გუდაური", ru: "Гудаури" },
  Kareli: { ka: "ქარელი", ru: "Карели" },
  Keda: { ka: "ქედა", ru: "Кеда" },
  Khelvachauri: { ka: "ხელვაჩაური", ru: "Хелвачаури" },
  Khertvisi: { ka: "ხერთვისი", ru: "Хертвиси" },
  Khobi: { ka: "ხობი", ru: "Хоби" },
  Kobuleti: { ka: "ქობულეთი", ru: "Кобулети" },
  Kulashi: { ka: "კულაში", ru: "Кулаши" },
  Kurdghelauri: { ka: "ქურდღელაური", ru: "Курдгелаури" },
  Kutaisi: { ka: "ქუთაისი", ru: "Кутаиси" },
  Lanchkhuti: { ka: "ლანჩხუთი", ru: "Ланчхути" },
  Leselidze: { ka: "ლესელიძე", ru: "Леселидзе" },
  Makhinjauri: { ka: "მახინჯაური", ru: "Махинджаури" },
  Marneuli: { ka: "მარნეული", ru: "Марнеули" },
  Matani: { ka: "მატანი", ru: "Матани" },
  Mtskheta: { ka: "მცხეთა", ru: "Мцхета" },
  Ninotsminda: { ka: "ნინოწმინდა", ru: "Ниноцминда" },
  Oni: { ka: "ონი", ru: "Они" },
  Ozurgeti: { ka: "ოზურგეთი", ru: "Озургети" },
  Pitsunda: { ka: "ბიჭვინთა", ru: "Пицунда" },
  Poti: { ka: "ფოთი", ru: "Поти" },
  Qvareli: { ka: "ყვარელი", ru: "Кварели" },
  Rustavi: { ka: "რუსთავი", ru: "Рустави" },
  Sachkhere: { ka: "საჩხერე", ru: "Сачхере" },
  Samtredia: { ka: "სამტრედია", ru: "Самтредиа" },
  Saqulia: { ka: "საქულია", ru: "Сакулиа" },
  Sarpi: { ka: "სარფი", ru: "Сарпи" },
  Sighnaghi: { ka: "სიღნაღი", ru: "Сигнахи" },
  Stepantsminda: { ka: "სტეფანწმინდა", ru: "Степанцминда" },
  Sukhumi: { ka: "სოხუმი", ru: "Сухуми" },
  Tamarisi: { ka: "თამარისი", ru: "Тамариси" },
  Tbilisi: { ka: "თბილისი", ru: "Тбилиси" },
  Telavi: { ka: "თელავი", ru: "Телави" },
  Tsalenjikha: { ka: "წალენჯიხა", ru: "Цаленджиха" },
  Tsikhisdziri: { ka: "ციხისძირი", ru: "Цихисдзири" },
  Tsqaltubo: { ka: "წყალტუბო", ru: "Цхалтубо" },
  Tsqneti: { ka: "წყნეთი", ru: "Цхнети" },
  Ureki: { ka: "ურეკი", ru: "Уреки" },
  Vladimirovka: { ka: "ვლადიმიროვკა", ru: "Владимировка" },
  Zahesi: { ka: "ზაჰესი", ru: "Загэси" },
  Zestaponi: { ka: "ზესტაფონი", ru: "Зестафони" },
  Zugdidi: { ka: "ზუგდიდი", ru: "Зугдиди" },
};

/** A stored city name as the page's language writes it. */
export function cityDisplayName(city: string, locale: string): string {
  const names = Object.prototype.hasOwnProperty.call(CITY_NAMES, city)
    ? CITY_NAMES[city]
    : null;
  if (!names) return city;
  if (locale === "ka") return names.ka;
  if (locale === "ru") return names.ru;
  return city;
}

/** Every city that has a translation (the unit test checks the GeoIP file). */
export const TRANSLATED_CITIES: readonly string[] = Object.keys(CITY_NAMES);

const countryNameCache = new Map<string, Readonly<Record<string, string>>>();

/**
 * Every region code with its name in the page's language. Built on the server
 * (Node has the full ICU data) and handed to the dashboard: Chrome ships no
 * Georgian region names, so the browser alone writes "GE" or "Georgia" on a
 * Georgian page.
 */
export function countryNames(locale: string): Readonly<Record<string, string>> {
  const cached = countryNameCache.get(locale);
  if (cached) return cached;
  const regions = new Intl.DisplayNames([locale], {
    type: "region",
    fallback: "none",
  });
  const names: Record<string, string> = {};
  for (let a = 65; a <= 90; a += 1) {
    for (let b = 65; b <= 90; b += 1) {
      const code = String.fromCharCode(a, b);
      const name = regions.of(code);
      if (name) names[code] = name;
    }
  }
  countryNameCache.set(locale, names);
  return names;
}
