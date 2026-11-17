# Map sync ownership

The server-side sync owns [the public grantee data](https://njcivicinfo.org/map/data/grantees.json), following the November 17, 2026 ownership decision recorded in [issue #12](https://github.com/CenterCoopMedia/njcic-grantees-map/issues/12).

## Data flow

```text
Airtable MAP VIEW → /map/sync.php → /map/data/grantees.json → map
```

`server/sync.php` is the repository template for the server endpoint. The deployed copy uses a private Airtable token and sync key. Keep credentials in the server configuration, outside Git; `sync-config.php` is ignored. The web server needs write access to the data directory for complete-file replacement. Configure ownership or a shared group rather than making the directory world-writable.

The scheduled workflow `.github/workflows/sync-airtable.yml` calls the existing `SYNC_URL` secret at 12:00 UTC daily: 7 AM EST or 8 AM EDT. Scheduled run [43964471573](https://github.com/CenterCoopMedia/njcic-grantees-map/actions/runs/43964471573) succeeded on November 16, immediately before the public JSON's last modification. The server endpoint is the writer. `scripts/sync-airtable.js` provides a local API/CSV transformation tool.

The JSON includes `projectName`, `awardsByYear`, `focusAreas`, `isCurrent`, `isNewOrg`, and `pressForward`. `Current` comes from the Airtable checkbox. `Total Awarded` and `Awarded in YEAR` preserve cents. Records marked `Returned/Cancelled grant?` are excluded, and grants are grouped by normalized organization name, before any colon.

## Public readback on November 17, 2026

The public JSON was 179,162 bytes, last modified November 16 at 21:52:45 UTC. It contained 102 organizations, 145 grants, 50 current organizations, and $15,054,220.05 in total funding. Its SHA-256 was `f98854375f84c4689ba3e71187b4d77eda0aaf0eb0aae0f8d1a14b593d4221ef`.

The public HTML and `js/app.js` differed from this branch. They still used the New grantee key, Active/Completed filter, and JavaScript version `20260921a`. The branch's Current filter, 2026 option, and year tiles are source changes awaiting a separately authorized hosting update. Public output establishes the JSON schema; it cannot establish that the deployed private PHP source is byte-identical to the template.

The checked-in `data/grantees.json` is an April 22 development snapshot. `staging/data/grantees.json` is a November 9 CSV preview with rounded amounts. Neither snapshot should be uploaded over the server-generated live file. Update grant information in Airtable.

## Verification and publishing

PR checks run on GitHub-hosted runners without production credentials. They check syntax and synthetic transformation contracts. They never invoke the production sync endpoint or publish files.

Merging repository source does not upload the map, update the PHP endpoint, change permissions, or refresh data. Hosting changes require a separate authorized task.
