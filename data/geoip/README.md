# GeoIP table for admin analytics (C49)

`dbip-lite.bin.gz` maps an IP address to a country (worldwide) and, inside
Georgia, to a city. `src/lib/analytics/geoip.ts` reads it to tag analytics hits
with the visitor's country and city for the admin dashboard's location filter.
The IP address itself is never stored.

- **Source:** DB-IP "IP to City Lite", month **2026-10**
  (`https://download.db-ip.com/free/dbip-city-lite-2026-10.csv.gz`).
- **Licence:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
  Attribution is required: the admin analytics page shows the link
  "IP Geolocation by DB-IP" (https://db-ip.com), and every analytics export
  repeats it. Keep both while this data is used.
- **Format:** see the header comment of `scripts/geoip/build-geoip.mjs`.

## Refresh (monthly, optional)

```bash
node scripts/geoip/build-geoip.mjs --month YYYY-MM
npm run test:unit
```

The script downloads the CSV (about 85 MB) into `~/.cache/mb-geoip` and
rewrites this file. The unit tests check the new file. They fail when DB-IP
adds a Georgian city that `src/lib/analytics/cities.ts` has no Georgian or
Russian name for, so add the name there. Update the month above, too.
