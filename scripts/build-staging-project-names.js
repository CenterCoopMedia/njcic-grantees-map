/**
 * Build staging/data/project-names.json from the Airtable CSV export.
 *
 * Stopgap for the staging map: until sync.php writes each grant's Airtable
 * "Project" field into grantees.json, the staging page looks project names up
 * in this file (matched by grantee name + amount + years).
 *
 * Usage:
 *   node scripts/build-staging-project-names.js ["data/Grants-Grid view.csv"]
 */

const fs = require('fs');
const path = require('path');

const csvPath = path.resolve(process.argv[2] || path.join(__dirname, '..', 'data', 'Grants-Grid view.csv'));
const outPath = path.join(__dirname, '..', 'staging', 'data', 'project-names.json');

// Minimal RFC 4180 CSV parser (handles quoted fields with commas/newlines)
function parseCsv(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
            else if (c === '"') inQuotes = false;
            else field += c;
        } else if (c === '"') inQuotes = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i++;
            row.push(field); rows.push(row); row = []; field = '';
        } else field += c;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    const [header, ...body] = rows;
    return body
        .filter(r => r.some(v => v.trim()))
        .map(r => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] || '').trim()])));
}

const text = fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, '');
const records = parseCsv(text);

const lookup = {};
let count = 0;
records.forEach(r => {
    const cancelled = ['checked', 'true', 'yes'].includes((r['Returned/Cancelled grant?'] || '').toLowerCase());
    const project = r['Project'];
    if (cancelled || !project) return;

    const name = (r['Grantee'] || '').split(':')[0].trim().toLowerCase();
    const amount = Math.round(parseFloat((r['Total awarded:'] || '0').replace(/[^0-9.]/g, '')) * 100) / 100;
    const years = (r['Year(s) granted:'] || '').split(',').map(y => y.trim()).filter(Boolean).sort();

    (lookup[name] = lookup[name] || []).push({ amount, years, projectName: project });
    count++;
});

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({
    source: path.basename(csvPath),
    generated: new Date().toISOString().split('T')[0],
    grantees: lookup
}, null, 2));
console.log(`Wrote ${count} project names for ${Object.keys(lookup).length} grantees to ${outPath}`);
