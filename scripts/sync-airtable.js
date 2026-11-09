/**
 * Airtable Sync Script for NJCIC Grantees Map
 *
 * Builds grantees.json from the Airtable "Grants to date" table. This is the
 * Node twin of server/sync.php: both use the same field names and produce
 * the same JSON, so the map behaves the same whichever one generated it.
 *
 * Usage:
 *   node scripts/sync-airtable.js                      # Airtable API -> data/grantees.json
 *   node scripts/sync-airtable.js --csv <export.csv>   # Airtable CSV export instead of the API
 *       [--out <file>]                    output path (default data/grantees.json)
 *       [--descriptions-from <json>]      CSV mode: borrow "Grant purpose" text from an
 *                                         existing grantees.json (the MAP VIEW export
 *                                         doesn't include that column)
 *       [--dump-records <file>]           also write the records as API-shaped JSON
 *                                         (used to test sync.php against the same input)
 *
 * Environment variables (API mode):
 *   AIRTABLE_PAT      Personal Access Token (required)
 *   AIRTABLE_BASE_ID  default appryDZWgPpP0GmZw
 *   AIRTABLE_TABLE_ID default tblFADXYCq495smGH
 *   AIRTABLE_VIEW_ID  default viwjXro41ehrvxTfs (MAP VIEW); '-' for no view filter
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const CONFIG = {
    PAT: process.env.AIRTABLE_PAT,
    BASE_ID: process.env.AIRTABLE_BASE_ID || 'appryDZWgPpP0GmZw',
    TABLE_ID: process.env.AIRTABLE_TABLE_ID || 'tblFADXYCq495smGH',
    VIEW_ID: process.env.AIRTABLE_VIEW_ID || 'viwjXro41ehrvxTfs'
};

// Airtable field names. Fields marked (optional) are used when present.
const FIELDS = {
    GRANTEE: 'Grantee',
    PROJECT: 'Project Name',
    TOTAL: 'Total Awarded',
    YEARS: 'Year(s) granted:',
    FOCUS_AREA: 'Focus area',
    SERVICE_AREA: 'Service area',
    COUNTY: 'County',
    MUNICIPALITIES: 'Municipalities',
    WEBSITE: 'Grantee website',
    LAT: 'Lat',
    LNG: 'Long',
    CURRENT: 'Current',
    PRESS_FORWARD: 'Press Forward Grant?',
    GRANT_PURPOSE: 'Grant purpose',              // (optional) popup description
    CITY: 'City',                                // (optional) preferred over Municipalities
    NEW_ORG: 'New org?',                         // (optional)
    CANCELLED: 'Returned/Cancelled grant?'       // (optional) excluded when checked
};

// Per-year amount columns: "Awarded in 2021" ... (any year found is used)
const AWARDED_IN_PATTERN = /^Awarded in (\d{4})$/;

// Default coordinates (county seats / regional centers) when Lat/Long are blank
const DEFAULT_COORDS = {
    'Atlantic County': { lat: 39.3643, lng: -74.4229, city: 'Atlantic City' },
    'Bergen County': { lat: 40.8859, lng: -74.0435, city: 'Hackensack' },
    'Burlington County': { lat: 39.9929, lng: -74.7877, city: 'Mount Holly' },
    'Camden County': { lat: 39.9259, lng: -75.1196, city: 'Camden' },
    'Cape May County': { lat: 38.9351, lng: -74.9060, city: 'Cape May' },
    'Cumberland County': { lat: 39.4273, lng: -75.2341, city: 'Bridgeton' },
    'Essex County': { lat: 40.7357, lng: -74.1724, city: 'Newark' },
    'Gloucester County': { lat: 39.7029, lng: -75.1118, city: 'Woodbury' },
    'Hudson County': { lat: 40.7178, lng: -74.0431, city: 'Jersey City' },
    'Hunterdon County': { lat: 40.5123, lng: -74.8582, city: 'Flemington' },
    'Mercer County': { lat: 40.2206, lng: -74.7597, city: 'Trenton' },
    'Middlesex County': { lat: 40.4922, lng: -74.4513, city: 'New Brunswick' },
    'Monmouth County': { lat: 40.2604, lng: -74.2727, city: 'Freehold' },
    'Morris County': { lat: 40.7968, lng: -74.4815, city: 'Morristown' },
    'Ocean County': { lat: 39.9526, lng: -74.1937, city: 'Toms River' },
    'Passaic County': { lat: 40.9168, lng: -74.1718, city: 'Paterson' },
    'Salem County': { lat: 39.5687, lng: -75.4671, city: 'Salem' },
    'Somerset County': { lat: 40.5693, lng: -74.6094, city: 'Somerville' },
    'Sussex County': { lat: 41.0581, lng: -74.7524, city: 'Newton' },
    'Union County': { lat: 40.6660, lng: -74.2009, city: 'Elizabeth' },
    'Warren County': { lat: 40.8293, lng: -75.0371, city: 'Belvidere' },
    'Statewide': { lat: 40.2206, lng: -74.7597, city: 'Trenton' },
    'North Jersey': { lat: 40.7357, lng: -74.1724, city: 'Newark' },
    'Central Jersey': { lat: 40.4922, lng: -74.4513, city: 'New Brunswick' },
    'South Jersey': { lat: 39.9259, lng: -75.1196, city: 'Camden' }
};

// ---------------------------------------------------------------------------
// Value helpers (mirrored in server/sync.php)
// ---------------------------------------------------------------------------

function str(value) {
    if (Array.isArray(value)) return value.map(str).filter(Boolean).join(', ');
    if (value === null || value === undefined) return '';
    return String(value).replace(/\s+/g, ' ').trim();
}

// Checkbox (true), or text/select values such as "checked" / "Yes"
function isTruthy(value) {
    if (Array.isArray(value)) return value.some(isTruthy);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value > 0;
    if (typeof value === 'string') {
        return ['yes', 'y', 'true', '1', 'current', 'checked', 'x'].includes(value.trim().toLowerCase());
    }
    return false;
}

// Currency/number: 10000, "$10000", "$10,000.50"
function toMoney(value) {
    if (typeof value === 'number') return Math.round(value * 100) / 100;
    const cleaned = str(value).replace(/[^0-9.\-]/g, '');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

// Coordinate: 39.8989, "39.8989", or "39,8989" (decimal comma)
function toCoord(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const s = str(value).replace(',', '.');
    if (!s) return null;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
}

// Multiple-select (array) or comma/semicolon separated text -> trimmed list
function toList(value, separator = /[,;]/) {
    const parts = Array.isArray(value) ? value : str(value).split(separator);
    const out = [];
    parts.map(str).filter(Boolean).forEach(p => { if (!out.includes(p)) out.push(p); });
    return out;
}

function sortedYears(list) {
    return [...new Set(list.map(String))].filter(y => /^\d{4}$/.test(y)).sort();
}

function countyKey(county) {
    const c = str(county);
    if (!c) return '';
    return /county$/i.test(c) || DEFAULT_COORDS[c] ? c : `${c} County`;
}

// "to fund X" -> "Received funding to fund X"; full sentences are kept as-is
function describe(purpose) {
    const p = str(purpose);
    if (!p) return '';
    return /^[a-z]/.test(p) ? `Received funding ${p}` : p;
}

function statusFromYears(years) {
    const currentYear = new Date().getFullYear();
    return years.some(y => parseInt(y, 10) >= currentYear - 1) ? 'active' : 'completed';
}

function formatMoney(n) {
    return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// Transform (mirrored in server/sync.php)
// ---------------------------------------------------------------------------

function transformRecords(records) {
    const groups = new Map();

    records.forEach(record => {
        const f = record.fields || {};
        if (isTruthy(f[FIELDS.CANCELLED])) return;

        const fullName = str(f[FIELDS.GRANTEE]);
        if (!fullName) return;
        // "Org: Project" naming groups under "Org"
        const colon = fullName.indexOf(':');
        const name = colon > -1 ? fullName.slice(0, colon).trim() : fullName;
        const nameProject = colon > -1 ? fullName.slice(colon + 1).trim() : '';

        // Per-year amounts from "Awarded in YEAR" columns
        const awardsByYear = {};
        Object.keys(f).sort().forEach(key => {
            const m = key.match(AWARDED_IN_PATTERN);
            if (m) {
                const amt = toMoney(f[key]);
                if (amt) awardsByYear[m[1]] = amt;
            }
        });
        const awardsSum = Object.values(awardsByYear).reduce((s, a) => s + Math.round(a * 100), 0) / 100;

        let years = sortedYears(toList(f[FIELDS.YEARS]));
        if (!years.length) years = Object.keys(awardsByYear).sort();
        const amount = toMoney(f[FIELDS.TOTAL]) || awardsSum;
        const focusAreas = toList(f[FIELDS.FOCUS_AREA], /;/);

        const grant = {
            projectName: str(f[FIELDS.PROJECT]) || nameProject || null,
            years,
            amount,
            awardsByYear,
            description: describe(f[FIELDS.GRANT_PURPOSE]),
            focusArea: focusAreas.join('; '),
            status: statusFromYears(years),
            isCurrent: isTruthy(f[FIELDS.CURRENT]),
            pressForward: isTruthy(f[FIELDS.PRESS_FORWARD])
        };

        const key = name.toLowerCase();
        if (!groups.has(key)) {
            groups.set(key, {
                name, records: [], website: '', serviceArea: '', county: '',
                lat: null, lng: null, city: '', isNewOrg: false
            });
        }
        const g = groups.get(key);
        g.records.push({ grant, focusAreas });

        const lat = toCoord(f[FIELDS.LAT]);
        const lng = toCoord(f[FIELDS.LNG]);
        if (g.lat === null && lat !== null && lng !== null) { g.lat = lat; g.lng = lng; }
        if (!g.website) g.website = str(f[FIELDS.WEBSITE]);
        if (!g.serviceArea) g.serviceArea = str(f[FIELDS.SERVICE_AREA]);
        if (!g.county) g.county = str(f[FIELDS.COUNTY]);
        if (!g.city) g.city = str(f[FIELDS.CITY]) || (toList(f[FIELDS.MUNICIPALITIES])[0] || '');
        if (isTruthy(f[FIELDS.NEW_ORG])) g.isNewOrg = true;
    });

    const grantees = [];
    groups.forEach(g => {
        // Largest / longest-running grant first
        const grants = g.records.map(r => r.grant)
            .sort((a, b) => b.amount - a.amount || a.years.join().localeCompare(b.years.join()));

        const serviceArea = g.serviceArea || 'Statewide';
        let { lat, lng, city } = g;
        if (lat === null || lng === null) {
            const fallback = DEFAULT_COORDS[countyKey(g.county)] || DEFAULT_COORDS[serviceArea] || DEFAULT_COORDS['Statewide'];
            lat = fallback.lat; lng = fallback.lng;
            city = city || fallback.city;
        }

        const years = sortedYears(grants.flatMap(gr => gr.years));
        const totalAmount = grants.reduce((s, gr) => s + Math.round(gr.amount * 100), 0) / 100;
        const focusAreas = [];
        grants.forEach(gr => toList(gr.focusArea, /;/).forEach(a => { if (!focusAreas.includes(a)) focusAreas.push(a); }));
        const awardsByYear = {};
        grants.forEach(gr => Object.entries(gr.awardsByYear).forEach(([y, a]) => {
            awardsByYear[y] = Math.round(((awardsByYear[y] || 0) + a) * 100) / 100;
        }));
        const sortedAwards = {};
        Object.keys(awardsByYear).sort().forEach(y => { sortedAwards[y] = awardsByYear[y]; });

        const result = {
            name: g.name,
            county: serviceArea,
            city,
            years,
            amount: totalAmount,
            lat,
            lng,
            status: statusFromYears(years),
            isCurrent: grants.some(gr => gr.isCurrent),
            isNewOrg: g.isNewOrg,
            pressForward: grants.some(gr => gr.pressForward),
            website: g.website,
            focusArea: focusAreas.join('; '),
            focusAreas,
            awardsByYear: sortedAwards
        };

        if (grants.length > 1) {
            result.description = `This organization received ${grants.length} grants totaling $${formatMoney(totalAmount)}.`;
            result.grants = grants.map((gr, i) => ({ id: i + 1, ...gr }));
            result.totalAmount = totalAmount;
            result.hasMultipleGrants = true;
            result.grantCount = grants.length;
        } else {
            result.projectName = grants[0].projectName;
            result.description = grants[0].description;
        }
        grantees.push(result);
    });

    // Case-insensitive code-point order (same as sync.php's strcmp on lowercase)
    const sortKey = n => n.toLowerCase();
    grantees.sort((a, b) => (sortKey(a.name) < sortKey(b.name) ? -1 : sortKey(a.name) > sortKey(b.name) ? 1 : 0));
    return grantees;
}

function calculateMetadata(grantees, source) {
    const totalFunding = grantees.reduce((s, g) => s + Math.round(g.amount * 100), 0) / 100;
    const totalGrants = grantees.reduce((s, g) => s + (g.grantCount || 1), 0);
    return {
        totalGrantees: grantees.length,
        totalFunding,
        officialTotalFunding: 11880438, // Official NJCIC figure
        totalGrants,
        currentGrantees: grantees.filter(g => g.isCurrent).length,
        lastUpdated: new Date().toISOString().split('T')[0],
        dataSource: source,
        note: 'Data synced from Airtable. Organizations with multiple grants are consolidated.'
    };
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

function fetchPage(offset) {
    return new Promise((resolve, reject) => {
        let p = `/v0/${CONFIG.BASE_ID}/${CONFIG.TABLE_ID}?pageSize=100`;
        if (CONFIG.VIEW_ID && CONFIG.VIEW_ID !== '-') p += `&view=${encodeURIComponent(CONFIG.VIEW_ID)}`;
        if (offset) p += `&offset=${encodeURIComponent(offset)}`;
        const req = https.request({
            hostname: 'api.airtable.com', path: p, method: 'GET',
            headers: { Authorization: `Bearer ${CONFIG.PAT}` }
        }, res => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => {
                if (res.statusCode !== 200) return reject(new Error(`Airtable HTTP ${res.statusCode}: ${data}`));
                try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(`Bad JSON: ${data}`)); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function fetchAllRecords() {
    let all = [], offset = null;
    do {
        const page = await fetchPage(offset);
        all = all.concat(page.records || []);
        offset = page.offset;
        console.log(`Fetched ${all.length} records...`);
    } while (offset);
    return all;
}

// Minimal RFC 4180 CSV parser
function parseCsv(text) {
    const rows = [];
    let row = [], field = '', q = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) {
            if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
            else if (c === '"') q = false;
            else field += c;
        } else if (c === '"') q = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i++;
            row.push(field); rows.push(row); row = []; field = '';
        } else field += c;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    const [header, ...body] = rows;
    return body.filter(r => r.some(v => v.trim())).map((r, i) => {
        const fields = {};
        header.forEach((h, j) => { if ((r[j] || '') !== '') fields[h.trim()] = r[j]; });
        return { id: `csv-row-${i + 2}`, fields };
    });
}

// CSV mode: borrow descriptions from an existing grantees.json, matched by
// grantee name + amount (then name + years) because the MAP VIEW export
// leaves out "Grant purpose".
function borrowDescriptions(records, jsonPath) {
    const old = JSON.parse(fs.readFileSync(jsonPath, 'utf8')).grantees || [];
    const pool = new Map();
    old.forEach(g => {
        const grants = g.grants || [{ amount: g.amount, years: g.years, description: g.description }];
        pool.set(str(g.name).toLowerCase(), grants.map(gr => ({ ...gr, used: false })));
    });
    let matched = 0;
    records.forEach(r => {
        const f = r.fields;
        if (f[FIELDS.GRANT_PURPOSE]) return;
        const list = pool.get(str(f[FIELDS.GRANTEE]).split(':')[0].trim().toLowerCase()) || [];
        const amount = toMoney(f[FIELDS.TOTAL]);
        const years = sortedYears(toList(f[FIELDS.YEARS])).join();
        const hit = list.find(g => !g.used && sortedYears(g.years || []).join() === years && toMoney(g.amount) === amount)
            || list.find(g => !g.used && sortedYears(g.years || []).join() === years)
            || list.find(g => !g.used && toMoney(g.amount) === amount);
        if (hit && hit.description) {
            hit.used = true;
            // stored descriptions already carry the "Received funding" prefix
            f[FIELDS.GRANT_PURPOSE] = str(hit.description).replace(/^Received funding (?=[A-Z])/, '');
            matched++;
        }
    });
    console.log(`Borrowed descriptions for ${matched} of ${records.length} records`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function arg(name) {
    const i = process.argv.indexOf(name);
    return i > -1 ? process.argv[i + 1] : null;
}

async function main() {
    const csvPath = arg('--csv');
    const outPath = path.resolve(arg('--out') || path.join(__dirname, '..', 'data', 'grantees.json'));
    let records, source;

    if (csvPath) {
        records = parseCsv(fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, ''));
        source = `Airtable CSV export (${path.basename(csvPath)})`;
        const descFrom = arg('--descriptions-from');
        if (descFrom) borrowDescriptions(records, descFrom);
    } else {
        if (!CONFIG.PAT) {
            console.error('ERROR: AIRTABLE_PAT environment variable is required (or use --csv)');
            process.exit(1);
        }
        records = await fetchAllRecords();
        source = 'Airtable - Grants to date: NJ Civic Info Consortium';
    }
    console.log(`Loaded ${records.length} records`);

    const dumpPath = arg('--dump-records');
    if (dumpPath) fs.writeFileSync(dumpPath, JSON.stringify({ records }, null, 2));

    const grantees = transformRecords(records);
    if (!grantees.length) throw new Error('No grantees produced; refusing to overwrite output');
    const metadata = calculateMetadata(grantees, source);

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify({ grantees, metadata }, null, 2));

    console.log(`\nWritten to ${outPath}`);
    console.log(`Grantees: ${metadata.totalGrantees} | Grants: ${metadata.totalGrants} | ` +
        `Current: ${metadata.currentGrantees} | Funding: $${formatMoney(metadata.totalFunding)}`);
}

if (require.main === module) {
    main().catch(err => { console.error('Sync failed:', err.message); process.exit(1); });
}

module.exports = { transformRecords, calculateMetadata, parseCsv };
