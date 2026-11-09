# Staging copy of the map

Preview of the November 2026 map updates. Upload this folder to
`/public_html/map/staging/` → https://njcivicinfo.org/map/staging/.
It is marked `noindex` and doesn't register the service worker.

## What changed compared with the live map

- **Map key:** "Single grantee" / "New grantee" are now **Completed grant** / **Current grant**,
  driven by the Airtable **Current** checkbox (orange marker = current). The Active/Completed
  status column is gone.
- **Year filter:** 2026 added.
- **Focus area filter:** the four Airtable **Focus area** options — Civic Engagement,
  Civic News & Information, Journalism Pipeline, Capacity Building.
- **Status filter:** All / Current, based on the Current checkbox.
- **Popups:** each grant is titled with its Airtable **Project Name** (single-grant popups get a
  "Project" row), amounts come from **Total Awarded**, and a "By year" line shows the
  **Awarded in YEAR** amounts.

## Where staging gets its data

1. `../data/grantees.json` (the live file) **once the new `sync.php` has run**. Staging detects the
   new format automatically.
2. Until then, `staging/data/grantees.json`, a snapshot built from the MAP VIEW CSV export:

   ```bash
   node scripts/sync-airtable.js --csv "Grants-MAP VIEW.csv" --out staging/data/grantees.json --descriptions-from data/grantees.json
   ```

   The MAP VIEW export has no "Grant purpose" column, so descriptions are borrowed from an
   existing grantees.json. The live sync reads "Grant purpose" straight from Airtable.

## Deploying the new sync

`server/sync.php` replaces `/public_html/map/sync.php`.

1. Open the old `sync.php` on the server and copy its Airtable token and secret key.
2. Paste them into the two `PASTE_..._HERE` lines at the top of the new file (server copy only;
   never commit them), or put them in `sync-config.php` next to it.
3. Upload it, then visit `sync.php?key=SECRET&debug=1` once to check the counts and field names.

The new JSON is backward compatible, so the live map keeps working. It will also start showing
Project Names and Total Awarded amounts, and its focus-area dropdown will list the new labels.

## Promoting to production

Copy `staging/index.html` → `index.html` and `staging/js/app.js` → `js/app.js`, then:
- remove the staging banner and restore `<meta name="robots" content="index, follow">` and the title
- in `app.js`, make `loadGranteeData()` just fetch `data/grantees.json`
- restore the service worker registration block at the bottom of `app.js`
- bump the `app.js?v=` query string
