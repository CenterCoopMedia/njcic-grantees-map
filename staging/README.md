# Staging copy of the map

Preview of the November 2026 map updates. Upload this folder to
`/public_html/map/staging/` so it's reachable at https://njcivicinfo.org/map/staging/.
It reads the live `../data/grantees.json`, so no separate sync is needed. It is
marked `noindex` and doesn't register the service worker.

## What changed compared with the live map

- Map key: "Single grantee" / "New grantee" are now **Completed grant** / **Current grant**,
  driven by the Airtable **Current** field (orange marker = current).
- Map key: the Active/Completed status column has been removed.
- Year filter: **2026** added.
- Focus area filter: fixed to the Airtable **Focus area** options — Community Engagement,
  Civic News & Information, Journalism Pipeline, Capacity Building. Older labels are mapped:
  - Civic engagement in NJ communities → Community Engagement
  - Civic news and information reporting → Civic News & Information
  - Journalism pipeline → Journalism Pipeline
  - Blue Engine Tech & Sustainability Accelerator Grant → Capacity Building
- Status filter: **All** / **Current** only, based on the Current field.
- Grantee popups: for organizations with several grants, each grant is titled with its
  Airtable **Project** name (e.g. "Statewide Paid Internship Program") instead of "Grant #1",
  "Grant #2". "Grant #N" is shown only when a record's Project field is empty.
  Until sync.php writes the Project field, staging reads names from
  `staging/data/project-names.json`, built from the Airtable CSV export with
  `node scripts/build-staging-project-names.js` (re-run after exporting a fresh CSV).

## Required sync change (sync.php on the server)

`grantees.json` doesn't carry the Current or Project fields yet. Until they're synced,
staging falls back to the old year-based "active" status (a warning shows in the browser
console) and takes project names from `data/project-names.json`. To use the real fields,
add this to `sync.php`. It mirrors the change already made in `scripts/sync-airtable.js`:

```php
// helper
function is_truthy_flag($v) {
    if (is_array($v)) { foreach ($v as $x) if (is_truthy_flag($x)) return true; return false; }
    if (is_bool($v)) return $v;
    if (is_numeric($v)) return $v > 0;
    if (is_string($v)) return in_array(strtolower(trim($v)), ['yes','y','true','1','current','checked','x']);
    return false;
}

// per record
$isCurrent = is_truthy_flag($fields['Current'] ?? null);
$projectName = trim($fields['Project'] ?? '');

// on each grant entry:    'isCurrent' => $isCurrent, 'projectName' => $projectName
// on the grantee entry:   'isCurrent' => true if ANY of its grants is current
```

The live map ignores the new `isCurrent` field and already shows `projectName` when present, so this change is safe for production.

## Promoting to production

Copy `staging/index.html` → `index.html` and `staging/js/app.js` → `js/app.js`, then:
- remove the staging banner and restore `<meta name="robots" content="index, follow">` and the title
- change `DATA_URL` in `app.js` back to `'data/grantees.json'`
- restore the service worker registration block at the bottom of `app.js`
- bump the `app.js?v=` query string
- once sync.php writes `projectName`, the project-names.json lookup can be removed
