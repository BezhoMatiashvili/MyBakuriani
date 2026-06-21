-- Seed the admin-managed landing "status cards" (weather / ski lifts / road /
-- cameras) into the existing site_settings table (public read, admin-only write).
-- Non-destructive: ON CONFLICT DO NOTHING preserves any edits an admin has made.
-- The shape mirrors src/lib/status-cards/types.ts (StatusCard[]).

INSERT INTO public.site_settings (key, value)
VALUES (
  'status_cards',
  '{
  "cards": [
    {
      "id": "weather",
      "icon": "none",
      "label": {
        "ka": "ამინდი",
        "en": "Weather",
        "ru": "Погода"
      },
      "value": {
        "ka": "-4°C",
        "en": "-4°C",
        "ru": "-4°C"
      },
      "redDot": false,
      "expandable": false,
      "active": true,
      "items": []
    },
    {
      "id": "lifts",
      "icon": "mountain",
      "label": {
        "ka": "საბაგიროები",
        "en": "Ski lifts",
        "ru": "Подъёмники"
      },
      "value": {
        "ka": "3/5 ღია",
        "en": "3/5 open",
        "ru": "3/5 открыты"
      },
      "redDot": false,
      "expandable": true,
      "active": true,
      "items": [
        {
          "id": "lift-kokhta-1",
          "label": {
            "ka": "კოხტა 1",
            "en": "Kokhta 1",
            "ru": "Кохта 1"
          },
          "value": {
            "ka": "ღია",
            "en": "Open",
            "ru": "Открыт"
          },
          "status": "ok",
          "url": null
        },
        {
          "id": "lift-kokhta-2",
          "label": {
            "ka": "კოხტა 2",
            "en": "Kokhta 2",
            "ru": "Кохта 2"
          },
          "value": {
            "ka": "ღია",
            "en": "Open",
            "ru": "Открыт"
          },
          "status": "ok",
          "url": null
        },
        {
          "id": "lift-didveli",
          "label": {
            "ka": "დიდველი",
            "en": "Didveli",
            "ru": "Дидвели"
          },
          "value": {
            "ka": "ღია",
            "en": "Open",
            "ru": "Открыт"
          },
          "status": "ok",
          "url": null
        },
        {
          "id": "lift-tatra",
          "label": {
            "ka": "ტატრა",
            "en": "Tatra",
            "ru": "Татра"
          },
          "value": {
            "ka": "დაკეტილი",
            "en": "Closed",
            "ru": "Закрыт"
          },
          "status": "closed",
          "url": null
        },
        {
          "id": "lift-mitarbi",
          "label": {
            "ka": "მიტარბი",
            "en": "Mitarbi",
            "ru": "Митарби"
          },
          "value": {
            "ka": "დაკეტილი",
            "en": "Closed",
            "ru": "Закрыт"
          },
          "status": "closed",
          "url": null
        }
      ]
    },
    {
      "id": "road",
      "icon": "car",
      "label": {
        "ka": "გზა თბილისიდან",
        "en": "Road from Tbilisi",
        "ru": "Дорога из Тбилиси"
      },
      "value": {
        "ka": "თავისუფალი",
        "en": "Clear",
        "ru": "Свободна"
      },
      "redDot": false,
      "expandable": false,
      "active": true,
      "items": []
    },
    {
      "id": "cameras",
      "icon": "video",
      "label": {
        "ka": "კამერები",
        "en": "Cameras",
        "ru": "Камеры"
      },
      "value": {
        "ka": "2 ლოკაცია",
        "en": "2 locations",
        "ru": "2 локации"
      },
      "redDot": true,
      "expandable": true,
      "active": true,
      "items": [
        {
          "id": "cam-center",
          "label": {
            "ka": "ცენტრალური მოედანი",
            "en": "Central Square",
            "ru": "Центральная площадь"
          },
          "value": null,
          "status": "none",
          "url": null
        },
        {
          "id": "cam-kokhta",
          "label": {
            "ka": "კოხტა გორა",
            "en": "Kokhta Gora",
            "ru": "Кохта Гора"
          },
          "value": null,
          "status": "none",
          "url": null
        }
      ]
    }
  ]
}'::jsonb
)
ON CONFLICT (key) DO NOTHING;
