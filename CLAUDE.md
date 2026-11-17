# NJCIC Grantees Map - project context

## Project overview

Interactive map displaying grantees of the New Jersey Civic Information Consortium. The map automatically syncs with Airtable, allowing NJCIC staff to update grantee information in Airtable and see changes reflected on the map daily.

**Live site:** https://njcivicinfo.org/map/
**GitHub repo:** https://github.com/jamditis/njcic-grantees-map

## Current statistics (December 2025)

- 75 grantee organizations
- 99 total grants awarded
- $12+ million in funding
- Grant years: 2021-2025

## Architecture

```
Airtable → sync.php (on server) → grantees.json → Map displays data
                ↑
    GitHub Actions triggers daily at 7am ET
```

### Data flow

1. NJCIC staff updates grantee info in Airtable
2. Daily sync runs at 7am ET (or manual trigger via sync URL)
3. sync.php fetches from Airtable API, transforms data, writes grantees.json
4. Map reads grantees.json and displays markers

## Key files

**Frontend:**
- `index.html` - Main page with map container and impact section
- `js/app.js` - Leaflet map logic, marker rendering, filtering, popups

**Data:**
- `data/grantees.json` - Grantee data (synced from Airtable)
- `sync.php` - PHP sync script (deployed to server, not in repo)

**Scripts (local development):**
- `scripts/sync-airtable.js` - Node.js sync script for local testing
- `scripts/populate-airtable-coords.js` - Push coordinates to Airtable

**Automation:**
- `.github/workflows/sync-airtable.yml` - Daily sync trigger

**Documentation:**
- `docs/NJCIC-Map-Guide.md` - Staff guide for NJCIC team
- `README.md` - Public documentation

## Airtable configuration

**Base:** Grants to date: NJ Civic Info Consortium
- Base ID: appryDZWgPpP0GmZw
- Table ID: tblFADXYCq495smGH
- View ID: viwjXro41ehrvxTfs

**Key fields:**
- Grantee (organization name)
- Grant purpose (description)
- Year(s) granted
- Total awarded
- Focus area
- Service area (county)
- Grantee website
- Lat, Long, City (coordinates)
- Returned/Cancelled grant? (checkbox to exclude from map)
- New org? (checkbox to highlight with orange marker and "NEW" badge)

**View:** MAP VIEW (starred for easy access)

**Field IDs for coordinates:**
- Lat: fldXBmRZZoCXp5M68
- Long: fldaDClMwhIEBuqeM
- City: fldFKPPOed5phSskL

## Server deployment

**Hosting:** Nestify (WordPress)
**Location:** /public_html/map/
**Sync URL:** https://njcivicinfo.org/map/sync.php?key=[SECRET_KEY]

The sync.php file contains the Airtable PAT and is deployed directly to the server via FTP (not committed to GitHub for security).

## GitHub secrets

- `SYNC_URL` - Full sync URL with secret key (used by GitHub Actions)

## Development

```bash
# Install dependencies
npm install

# Start local server
npm start

# Run sync locally (requires AIRTABLE_PAT env var)
npm run sync

# Push coordinates to Airtable
npm run sync:coords
```

## Recent changes (December 2025)

- Implemented live Airtable sync (replaces hardcoded data)
- Added GitHub Actions workflow for daily automated sync
- Created PHP sync script for server-side execution
- Populated 104 Airtable records with lat/lng coordinates
- Created comprehensive staff documentation
- Fixed createCustomIcon edge cases (trailing spaces, no uppercase letters)
- Resolved WordPress security issues (moved map outside wp-content)
- Changed URL from /grantees/map to /map
- Added cache-busting to JSON fetch (bypasses CDN caching)
- Fixed critical PHP reference bug in sync.php (`unset($grantee)` after loop)
- Added debug mode to sync.php (?debug=1 parameter)
- Updated meta tags (Open Graph, Twitter, canonical) to use /map/ URL
- Reduced JSON cache from 1 hour to 5 minutes in .htaccess
- Added app.js versioning for cache-busting on JS updates
- Added "New org?" feature to highlight new grantees with orange markers and badges

## November 2026 update

- Map key: "Current grant" (orange) / "Completed grant" (teal) from the Airtable **Current** checkbox; status column removed
- Filters: 2026 added; Focus area = Civic Engagement, Civic News & Information, Journalism Pipeline, Capacity Building; Status = All / Current
- Popups: grants titled by **Project Name**; amounts from **Total Awarded**; "Awarded by year" tiles from **Awarded in YEAR**
- New `server/sync.php` (template with placeholders, committed) mirrors `scripts/sync-airtable.js` (which also has `--csv` mode); the deployed copy holds the real token/key
- Server `data/` folder must be writable by www-data (777 folder / 666 grantees.json on Nestify)
- `staging/` holds the preview copy (noindex, no service worker)
- sw.js v3: network-first for pages and JSON

## Planned enhancements

- Connect impact section statistics to Airtable data (currently hardcoded)
- Add more filtering options
- Improve mobile experience

## Troubleshooting

**Map not updating after Airtable changes:**
- Daily sync runs at 7am ET
- For immediate update, visit sync URL or trigger GitHub Actions manually
- Clear browser cache (Ctrl+F5)

**Grantee in wrong location:**
- Check Lat/Long fields in Airtable
- Values should be decimal (40.7357, not 40° 44' 8")
- Use latlong.net to find correct coordinates

**Sync URL returns error:**
- Verify secret key is correct
- Check server logs if 500 error
- Ensure Airtable PAT hasn't expired

## Contacts

**Technical issues:** Joe Amditis (amditisj@montclair.edu)
**Airtable/data questions:** NJCIC staff

---

## Multi-machine workflow

This repo is developed across multiple machines (MacBook, work Windows PC, home Windows PC). GitHub is the source of truth.

**Before switching machines:**
```bash
git add . && git commit -m "WIP" && git push
```

**After switching machines:**
```bash
git pull
```
