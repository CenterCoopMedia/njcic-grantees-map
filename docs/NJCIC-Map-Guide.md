# NJCIC Grantees Map - Staff guide

![NJCIC grantee map](https://i.imgur.com/2lU1LGP.png)

## What is this?

The NJCIC Grantees Map is an interactive map that displays all Consortium grantees across New Jersey. It lives at:

**https://njcivicinfo.org/map/**

The map gets its data directly from the Airtable base "Grants to date: NJ Civic Info Consortium." When you update information in Airtable, those changes automatically appear on the map.

**Important:** The map pulls data from the **"MAP VIEW"** view in Airtable (starred for easy access). Make sure you're working in this view when editing grantee information.

![NJCIC grantee airtable base](https://i.imgur.com/cFZxewF.png)

---

## How to update grantee information

### Adding a new grantee

1. Open the Airtable base "Grants to date: NJ Civic Info Consortium"
2. Go to the **"MAP VIEW"** view (starred for easy access)
3. Add a new row with the grantee's information:
   - **Grantee** - Organization name
   - **Project Name** - Title shown for this grant in the map popup
   - **Grant purpose** - Description of what the grant funds
   - **Year(s) granted:** - Select the year(s)
   - **Awarded in 2021 … Awarded in 2026** - Amount awarded each year (shown as year tiles in the popup)
   - **Total Awarded** - Total dollar amount for this grant
   - **Focus area** - Civic Engagement, Civic News & Information, Journalism Pipeline or Capacity Building
   - **Current** - Check if the grant is current (see below)
   - **Service area** - County or region served
   - **County** and **Municipalities** - Used for the location label and as a fallback location
   - **Grantee website** - URL (optional)
   - **Lat** - Latitude coordinate (see below)
   - **Long** - Longitude coordinate (see below)

*Don't rename these fields. The sync looks them up by name, so a renamed field drops off the map.*

### Getting coordinates for new grantees

For new grantees, you'll need to add latitude and longitude so they appear in the correct location on the map:

1. Go to **https://www.latlong.net/**
2. Search for the grantee's city or address
3. Copy the latitude (e.g., 40.7357) into the **Lat** column
4. Copy the longitude (e.g., -74.1724) into the **Long** column

*Tip: If you don't add coordinates, the grantee will appear at the center of their county.*

### Editing existing grantees

Simply edit the fields in Airtable. Changes to names, amounts, descriptions, websites, etc. will all sync to the map.

### Removing a grantee

To remove a grantee from the map, check the **"Returned/Cancelled grant?"** checkbox in Airtable. The grantee will no longer appear on the map but the record stays in Airtable for your records.

### Current and completed grants

The **Current** checkbox controls how a grantee appears:

- **Current grant** - an **orange marker** with a soft glow, and a "Current grant" label in the tooltip and popup
- **Completed grant** - a **teal marker**

An organization with several grants shows as current if **any** of its grants is checked as Current. The **Status** filter above the map offers **All** and **Current**.

*Tip: Uncheck "Current" when a grant period ends.*

---

## When do changes appear on the map?

**Automatic sync:** Every day at **7:00 AM Eastern**, the map automatically pulls the latest data from Airtable.

**What this means:** If you update Airtable on Monday afternoon, the changes will appear on the map by Tuesday morning at 7am.

---

## How to update the map immediately

If you need changes to appear right away (before the next morning), you can trigger a manual sync:

### Option 1: Visit the sync URL

Go to this URL in your browser (bookmark this for easy access):
```
https://njcivicinfo.org/map/sync.php?key={SYNC_KEY}
```
The key is stored in the NJCIC password manager (ask Madi or Joe).

You'll see a message confirming the sync completed with details like:
- Number of grantees synced
- Total funding amount
- Time of sync

Then refresh the map page to see your changes.

### Option 2: Use GitHub Actions (for technical staff)

1. Go to https://github.com/jamditis/njcic-grantees-map/actions
2. Click "Sync Airtable Data"
3. Click "Run workflow" → "Run workflow"

---

## What the map displays

For each grantee, the map shows:
- **Organization name**
- **Location** (city and service area)
- **Current grant** label, when any grant is checked as Current
- **Project Name** for each grant
- **Total funding received** (from Total Awarded)
- **Awarded by year** tiles (from the Awarded in YEAR fields)
- **Focus area**
- **Project description** (from Grant purpose)
- **Link to website** (if provided)

Grantees with multiple grants are grouped together and show all their grant details in one popup.

---

## Understanding the data flow

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Airtable  │   →→→   │  Sync runs  │   →→→   │  Map shows  │
│  (you edit  │  (7am   │  (updates   │  (visitors│  updated   │
│   here)     │  daily) │   the data) │   see it) │   info)    │
└─────────────┘         └─────────────┘         └─────────────┘
```

1. **You update Airtable** - Add, edit, or mark grantees as returned
2. **Sync runs automatically** - Every morning at 7am ET
3. **Map displays new data** - Visitors see the updated information

---

## Important notes

### Only MAP VIEW records appear

The sync reads the **MAP VIEW** view. A record filtered out of that view won't appear on the map. A grant with "Returned/Cancelled grant?" checked is also left off.

### Multiple grants to same organization

If an organization receives multiple grants, they appear as a single marker on the map. Clicking on them shows details for all their grants.

### Grouping and project names

Grants are grouped into one marker when the **Grantee** name is exactly the same (extra spaces are ignored). Each grant in the popup is titled with its **Project Name**. Names that differ, like "Hammonton Gazette" and "Hammonton Gazette (Noticias)", stay as separate markers.

### Don't upload grantees.json by hand

The sync rewrites `data/grantees.json` every morning, so a hand-uploaded file is replaced at the next sync. Make changes in Airtable instead.

---

## Troubleshooting

### "I updated Airtable but the map hasn't changed"

- The automatic sync runs at 7am ET. If it's not yet 7am the next day, the change hasn't synced yet.
- To update immediately, visit the sync URL (see "How to update the map immediately" above).
- Try clearing your browser cache or doing a hard refresh (Ctrl+F5).

### "A grantee is in the wrong location on the map"

- Check the **Lat** and **Long** fields in Airtable
- Make sure they're decimal numbers (like 40.7357, not 40° 44' 8")
- Use https://www.latlong.net/ to find the correct coordinates

### "A grantee isn't showing up at all"

- Make sure the **"Returned/Cancelled grant?"** checkbox is NOT checked
- Make sure the **Grantee** name field is not empty
- Try triggering a manual sync

### "The sync URL gives an error"

- Make sure you're using the exact URL with the correct key
- **"Forbidden"** - the key is wrong or has been changed
- **"Airtable HTTP 401/403"** - the Airtable token in sync.php has expired or was deleted; create a new read-only token for the grants base and put it in sync.php on the server
- **"Cannot write … grantees.json"** - the web server lost permission to save in the map's `data` folder; in FileZilla set the `data` folder to 777 and `grantees.json` to 666

---

## Quick reference

| Task | How to do it |
|------|--------------|
| Add new grantee | Add row in Airtable (MAP VIEW) with all fields filled |
| Edit grantee info | Edit the row directly in Airtable |
| Remove grantee | Check "Returned/Cancelled grant?" in Airtable |
| Mark as current | Check "Current" in Airtable |
| Get coordinates | Use latlong.net to look up the city |
| Force immediate sync | Visit sync.php URL or use GitHub Actions |
| View the map | https://njcivicinfo.org/map/ |

---

## Contacts

**Technical issues with the map or sync:**
- Joe Amditis - [amditisj@montclair.edu](mailto:amditisj@montclair.edu)

**Airtable access or grantee data questions:**

- Ayinde Merrill - [ayindej@njcivicinfo.org](mailto:ayinde@njcivicinfo.org)
- Madi McCool - [madi@njcivicinfo.org](mailto:madi@njcivicinfo.org)

---

*Last updated: November 2026*
