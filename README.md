# NJ Civic Information Consortium grantees map

An interactive map of New Jersey Civic Information Consortium grantees, built for the Center for Cooperative Media at Montclair State University.

**Public map:** https://njcivicinfo.org/map/

![Map screenshot](https://i.imgur.com/yoYai54.png)

## Data and sync ownership

The server-side `/map/sync.php` reads the Airtable **MAP VIEW** and writes `/map/data/grantees.json`. The scheduled GitHub Actions workflow calls it at 12:00 UTC daily (7 AM EST / 8 AM EDT), using the existing `SYNC_URL` secret.

Read [sync ownership](docs/sync-ownership.md) for the source files, credential handling, and November 17, 2026 public comparison. The live JSON uses the new data schema. The live HTML and JavaScript still differ from this branch's interface. Merging source does not publish hosting changes.

Update grant information in Airtable. Keep the server-generated live JSON; the checked-in production and staging JSON files are development snapshots.

## Features in this source

- Leaflet map with CARTO Voyager tiles, marker clustering, and organization initials.
- Filters for 2021–2026, service area, focus area, and Current grants.
- Current/completed marker key, driven by Airtable's Current checkbox.
- Project titles, grant totals, and per-year award tiles.
- Multiple grants grouped under one organization.
- Grantee navigation, share links, and mobile controls.
- A noindex preview under `staging/`.

See the [staff guide](docs/NJCIC-Map-Guide.md) for field names, updates, and troubleshooting.

## Development

Use Node.js 22 or later.

```bash
git clone https://github.com/CenterCoopMedia/njcic-grantees-map.git
cd njcic-grantees-map
npm install
npm start
```

The local server opens at http://localhost:8080.

`scripts/sync-airtable.js` supports Airtable API input with `AIRTABLE_PAT`, or CSV input with `--csv`. It shares the JSON contract with the credential-free `server/sync.php` template. Keep real server credentials outside Git.

## Verification

This public repository uses GitHub-hosted CI. PR checks validate JavaScript and PHP syntax and synthetic transformation contracts, without invoking the server sync or using production secrets.

## License and credits

MIT License.

Created by Joe Amditis for the Center for Cooperative Media at Montclair State University.

Data source: New Jersey Civic Information Consortium.
