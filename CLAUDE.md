# NJCIC grantees map

Interactive map of New Jersey Civic Information Consortium grantees.

- Public map: https://njcivicinfo.org/map/
- Repository: https://github.com/CenterCoopMedia/njcic-grantees-map
- Sync ownership and public comparison: [docs/sync-ownership.md](docs/sync-ownership.md)
- Staff guide: [docs/NJCIC-Map-Guide.md](docs/NJCIC-Map-Guide.md)

## Architecture

The server-side `/map/sync.php` reads Airtable MAP VIEW and owns `/map/data/grantees.json`. Its repository template is `server/sync.php`; secrets belong only in server configuration. The scheduled workflow calls the configured `SYNC_URL` at 12:00 UTC daily (7 AM EST / 8 AM EDT). Do not upload development JSON snapshots over the generated live file.

The public HTML and JavaScript differed from the branch during the November 17, 2026 readback. Merging source does not publish interface or server changes. See the ownership document for dated evidence and the hosting boundary.

## Source files

- `index.html`: page and filter controls.
- `js/app.js`: Leaflet markers, Current-based filtering, project details, and year tiles.
- `server/sync.php`: server sync template, with no real credentials.
- `scripts/sync-airtable.js`: Node transformation tool, including CSV input. Keep its data contract aligned with PHP.
- `data/grantees.json`: development snapshot.
- `staging/`: noindex preview and November 9 CSV snapshot.
- `.github/workflows/sync-airtable.yml`: scheduled server trigger.
- `.github/workflows/ci.yml`: secret-free, hosted PR checks.

## Airtable fields

Base `appryDZWgPpP0GmZw`, table `tblFADXYCq495smGH`, MAP VIEW `viwjXro41ehrvxTfs`.

Use the field names exactly: `Grantee`, `Project Name`, `Grant purpose`, `Year(s) granted:`, `Total Awarded`, `Awarded in YEAR`, `Focus area`, `Current`, `Press Forward Grant?`, `Service area`, `County`, `Municipalities`, `Grantee website`, `Lat`, `Long`, `City`, `New org?`, and `Returned/Cancelled grant?`.

Returned/cancelled records are excluded. Grants group by trimmed, case-insensitive organization name before any colon; names with different suffixes remain separate. Any checked Current grant makes its organization current. Missing coordinates fall back to county or regional centers.

## Development

Install dependencies with `npm install` and serve the map with `npm start`. The API mode of `scripts/sync-airtable.js` requires `AIRTABLE_PAT`; its CSV mode needs no credential. Run sync tools only when the task authorizes them. Never print a token or include it in Git.

This repository is public. Tests, lint, builds, and other CI validation run on GitHub-hosted runners. Do not run local CI or dispatch the production sync to validate a PR.
