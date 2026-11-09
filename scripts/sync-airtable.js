/**
 * Airtable Sync Script for NJCIC Grantees Map
 *
 * Fetches grantee data from Airtable and merges with existing
 * geocoded location data to generate the grantees.json file.
 *
 * Usage:
 *   node scripts/sync-airtable.js
 *
 * Environment variables (or hardcoded for testing):
 *   AIRTABLE_PAT - Personal Access Token
 *   AIRTABLE_BASE_ID - Base ID
 *   AIRTABLE_TABLE_ID - Table ID
 *   AIRTABLE_VIEW_ID - View ID
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration - uses environment variables
// Set these in your .env file or environment
// By default the sync fetches every record in the table (no view filter).
// Set AIRTABLE_VIEW_ID to a view ID (e.g. 'viwjXro41ehrvxTfs' for the MAP
// view) to restrict the pull; leave it unset or set to '-' for no filter.
const CONFIG = {
    PAT: process.env.AIRTABLE_PAT,
    BASE_ID: process.env.AIRTABLE_BASE_ID || 'appryDZWgPpP0GmZw',
    TABLE_ID: process.env.AIRTABLE_TABLE_ID || 'tblFADXYCq495smGH',
    VIEW_ID: process.env.AIRTABLE_VIEW_ID || null
};

// Check for required credentials
if (!CONFIG.PAT) {
    console.error('ERROR: AIRTABLE_PAT environment variable is required');
    console.error('Set it in your .env file or environment');
    process.exit(1);
}

// Airtable field names (as they appear in the API response)
const FIELDS = {
    GRANTEE: 'Grantee',
    GRANT_PURPOSE: 'Grant purpose',
    YEARS: 'Year(s) granted:',
    AMOUNT: 'Total awarded:',
    FOCUS_AREA: 'Focus area',
    SERVICE_AREA: 'Service area',
    WEBSITE: 'Grantee website',
    CANCELLED: 'Returned/Cancelled grant?',
    CANCEL_REASON: 'Reason cancelled/returned:',
    CURRENT: 'Current',
    NEW_ORG: 'New org?',
    LAT: 'Lat',
    LNG: 'Long',
    CITY: 'City'
};

// County to city mapping for geocoding fallback
const COUNTY_CITIES = {
    'Atlantic County': 'Atlantic City',
    'Bergen County': 'Hackensack',
    'Burlington County': 'Mount Holly',
    'Camden County': 'Camden',
    'Cape May County': 'Cape May',
    'Cumberland County': 'Bridgeton',
    'Essex County': 'Newark',
    'Gloucester County': 'Woodbury',
    'Hudson County': 'Jersey City',
    'Hunterdon County': 'Flemington',
    'Mercer County': 'Trenton',
    'Middlesex County': 'New Brunswick',
    'Monmouth County': 'Freehold',
    'Morris County': 'Morristown',
    'Ocean County': 'Toms River',
    'Passaic County': 'Paterson',
    'Salem County': 'Salem',
    'Somerset County': 'Somerville',
    'Sussex County': 'Newton',
    'Union County': 'Elizabeth',
    'Warren County': 'Belvidere',
    'Statewide': 'Trenton',
    'North Jersey': 'Newark',
    'Central Jersey': 'New Brunswick',
    'South Jersey': 'Camden'
};

// Default coordinates for county seats
const DEFAULT_COORDS = {
    'Atlantic County': { lat: 39.3643, lng: -74.4229 },
    'Bergen County': { lat: 40.8859, lng: -74.0435 },
    'Burlington County': { lat: 39.9929, lng: -74.7877 },
    'Camden County': { lat: 39.9259, lng: -75.1196 },
    'Cape May County': { lat: 38.9351, lng: -74.9060 },
    'Cumberland County': { lat: 39.4273, lng: -75.2341 },
    'Essex County': { lat: 40.7357, lng: -74.1724 },
    'Gloucester County': { lat: 39.7029, lng: -75.1118 },
    'Hudson County': { lat: 40.7178, lng: -74.0431 },
    'Hunterdon County': { lat: 40.5123, lng: -74.8582 },
    'Mercer County': { lat: 40.2206, lng: -74.7597 },
    'Middlesex County': { lat: 40.4922, lng: -74.4513 },
    'Monmouth County': { lat: 40.2604, lng: -74.2727 },
    'Morris County': { lat: 40.7968, lng: -74.4815 },
    'Ocean County': { lat: 39.9526, lng: -74.1937 },
    'Passaic County': { lat: 40.9168, lng: -74.1718 },
    'Salem County': { lat: 39.5687, lng: -75.4671 },
    'Somerset County': { lat: 40.5693, lng: -74.6094 },
    'Sussex County': { lat: 41.0581, lng: -74.7524 },
    'Union County': { lat: 40.6660, lng: -74.2009 },
    'Warren County': { lat: 40.8293, lng: -75.0371 },
    'Statewide': { lat: 40.2206, lng: -74.7597 },
    'North Jersey': { lat: 40.7357, lng: -74.1724 },
    'Central Jersey': { lat: 40.4922, lng: -74.4513 },
    'South Jersey': { lat: 39.9259, lng: -75.1196 }
};

/**
 * Fetch all records from Airtable with pagination
 */
async function fetchAllRecords() {
    let allRecords = [];
    let offset = null;

    do {
        const records = await fetchPage(offset);
        allRecords = allRecords.concat(records.records);
        offset = records.offset;
        console.log(`Fetched ${allRecords.length} records...`);
    } while (offset);

    return allRecords;
}

/**
 * Fetch a single page of records from Airtable
 */
function fetchPage(offset = null) {
    return new Promise((resolve, reject) => {
        let pathUrl = `/v0/${CONFIG.BASE_ID}/${CONFIG.TABLE_ID}?pageSize=100`;
        if (CONFIG.VIEW_ID && CONFIG.VIEW_ID !== '-') {
            pathUrl += `&view=${CONFIG.VIEW_ID}`;
        }
        if (offset) {
            pathUrl += `&offset=${offset}`;
        }

        const options = {
            hostname: 'api.airtable.com',
            path: pathUrl,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${CONFIG.PAT}`
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse response: ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

/**
 * Load existing grantees data for coordinate lookup
 */
function loadExistingData() {
    const dataPath = path.join(__dirname, '..', 'data', 'grantees.json');
    try {
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        return data.grantees || [];
    } catch (e) {
        console.warn('Could not load existing grantees.json, starting fresh');
        return [];
    }
}

/**
 * Create a lookup map from existing grantees by name
 */
function createLookupMap(existingGrantees) {
    const lookup = new Map();
    existingGrantees.forEach(g => {
        // Normalize name for matching
        const normalizedName = g.name.toLowerCase().trim();
        lookup.set(normalizedName, {
            lat: g.lat,
            lng: g.lng,
            city: g.city
        });
    });
    return lookup;
}

/**
 * Interpret the Airtable "Current" field (checkbox, or a text/select/formula
 * value such as "Yes" or "Current").
 */
function isTruthyFlag(value) {
    if (Array.isArray(value)) return value.some(isTruthyFlag);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value > 0;
    if (typeof value === 'string') {
        return ['yes', 'y', 'true', '1', 'current', 'checked', 'x'].includes(value.trim().toLowerCase());
    }
    return false;
}

/**
 * Normalize the Focus area field, which may be a single value or a
 * multiple-select array, into an array of labels.
 */
function toFocusAreaList(value) {
    const parts = Array.isArray(value) ? value : String(value || '').split(';');
    return parts.map(p => String(p).trim()).filter(Boolean);
}

/**
 * Determine grant status based on years
 */
function determineStatus(years) {
    const currentYear = new Date().getFullYear();
    const hasRecentYear = years.some(y => parseInt(y) >= currentYear - 1);
    return hasRecentYear ? 'active' : 'completed';
}

/**
 * Get coordinates for a grantee
 */
function getCoordinates(granteeName, county, lookup) {
    // Try exact match from existing data
    const normalizedName = granteeName.toLowerCase().trim();
    if (lookup.has(normalizedName)) {
        return lookup.get(normalizedName);
    }

    // Try partial match
    for (const [name, coords] of lookup) {
        if (name.includes(normalizedName) || normalizedName.includes(name)) {
            return coords;
        }
    }

    // Fallback to county defaults
    const defaultCoord = DEFAULT_COORDS[county] || DEFAULT_COORDS['Statewide'];
    const defaultCity = COUNTY_CITIES[county] || 'Trenton';

    return {
        lat: defaultCoord.lat,
        lng: defaultCoord.lng,
        city: defaultCity
    };
}

/**
 * Extract base grantee name (handles "Org Name: Project Name" format)
 */
function extractBaseGranteeName(fullName) {
    // Check for colon-separated project name
    if (fullName.includes(':')) {
        return fullName.split(':')[0].trim();
    }
    return fullName;
}

/**
 * Extract project name if present (after colon)
 */
function extractProjectName(fullName) {
    if (fullName.includes(':')) {
        return fullName.split(':').slice(1).join(':').trim();
    }
    return null;
}

/**
 * Transform Airtable records to grantees.json format
 */
function transformRecords(records, lookup) {
    // Filter out cancelled/returned grants
    const activeRecords = records.filter(r => !r.fields[FIELDS.CANCELLED]);

    // Group by BASE grantee name (before colon if present)
    const granteeMap = new Map();

    activeRecords.forEach(record => {
        const fields = record.fields;
        const fullName = (fields[FIELDS.GRANTEE] || '').trim();  // Trim whitespace
        const baseName = extractBaseGranteeName(fullName);
        const projectName = extractProjectName(fullName);
        const years = fields[FIELDS.YEARS] || [];
        // Round to cents at the source so every downstream serialization
        // (per-grant amount, per-grantee total, metadata totalFunding) is
        // consistent even if Airtable ever emits a fractional-cent value.
        const amount = Math.round((fields[FIELDS.AMOUNT] || 0) * 100) / 100;
        const description = fields[FIELDS.GRANT_PURPOSE] || '';
        const focusAreaList = toFocusAreaList(fields[FIELDS.FOCUS_AREA]);
        const focusArea = focusAreaList.join('; ');
        const isCurrent = isTruthyFlag(fields[FIELDS.CURRENT]);
        const isNewOrg = isTruthyFlag(fields[FIELDS.NEW_ORG]);
        const county = fields[FIELDS.SERVICE_AREA] || 'Statewide';
        const website = fields[FIELDS.WEBSITE] || '';
        const lat = fields[FIELDS.LAT];
        const lng = fields[FIELDS.LNG];
        const city = fields[FIELDS.CITY];

        if (!granteeMap.has(baseName)) {
            granteeMap.set(baseName, {
                name: baseName,
                county,
                grants: [],
                years: new Set(),
                website,
                focusAreas: new Set(),
                isCurrent: false,
                isNewOrg: false,
                // Store coordinates from the first record we see
                lat: lat,
                lng: lng,
                city: city
            });
        }

        const grantee = granteeMap.get(baseName);

        // Update coordinates if not already set
        if (!grantee.lat && lat) grantee.lat = lat;
        if (!grantee.lng && lng) grantee.lng = lng;
        if (!grantee.city && city) grantee.city = city;

        // A grantee is current if any of its grants is current
        if (isCurrent) grantee.isCurrent = true;
        if (isNewOrg) grantee.isNewOrg = true;

        // Add grant details
        grantee.grants.push({
            projectName: projectName,  // Will be null if no project name
            years: years,
            amount: amount,
            description: `Received funding ${description}`,
            focusArea: focusArea,
            status: determineStatus(years),
            isCurrent: isCurrent
        });

        // Merge years
        years.forEach(y => grantee.years.add(y));

        // Merge focus areas
        focusAreaList.forEach(a => grantee.focusAreas.add(a));

        // Update website if not set
        if (!grantee.website && website) {
            grantee.website = website;
        }
    });

    // Convert to final format
    const grantees = [];

    granteeMap.forEach((grantee, name) => {
        // Use coordinates from Airtable, fallback to lookup or defaults
        let lat = grantee.lat;
        let lng = grantee.lng;
        let city = grantee.city;

        // Fallback to lookup if Airtable doesn't have coordinates
        if (!lat || !lng) {
            const coords = getCoordinates(name, grantee.county, lookup);
            lat = lat || coords.lat;
            lng = lng || coords.lng;
            city = city || coords.city;
        }

        const yearsArray = Array.from(grantee.years).sort();
        const totalAmount = grantee.grants.reduce(
            (sum, g) => sum + Math.round((g.amount || 0) * 100),
            0
        ) / 100;
        const focusAreasArray = Array.from(grantee.focusAreas);

        const result = {
            name: grantee.name,
            county: grantee.county,
            city: city || '',
            years: yearsArray,
            amount: totalAmount,
            lat: lat,
            lng: lng,
            status: determineStatus(yearsArray),
            website: grantee.website,
            focusArea: focusAreasArray.join('; '),
            isCurrent: grantee.isCurrent,
            isNewOrg: grantee.isNewOrg
        };

        // Handle multiple grants
        if (grantee.grants.length > 1) {
            result.description = `This organization received ${grantee.grants.length} grants totaling $${totalAmount.toLocaleString()}.`;
            result.grants = grantee.grants.map((g, i) => ({
                id: i + 1,
                years: g.years,
                amount: g.amount,
                description: g.description,
                focusArea: g.focusArea,
                status: g.status,
                isCurrent: g.isCurrent
            }));
            result.totalAmount = totalAmount;
            result.focusAreas = focusAreasArray;
            result.hasMultipleGrants = true;
            result.grantCount = grantee.grants.length;
        } else {
            result.description = grantee.grants[0].description;
        }

        grantees.push(result);
    });

    // Sort by name
    grantees.sort((a, b) => a.name.localeCompare(b.name));

    return grantees;
}

/**
 * Calculate metadata
 */
function calculateMetadata(grantees) {
    // Accumulate in integer cents to avoid binary-float rounding drift
    // (e.g. 12210438.629999999 instead of 12210438.63).
    const totalFundingCents = grantees.reduce(
        (sum, g) => sum + Math.round((g.amount || 0) * 100),
        0
    );
    const totalFunding = totalFundingCents / 100;
    // Count total grants across all grantees
    const totalGrants = grantees.reduce((sum, g) => {
        if (g.hasMultipleGrants && g.grantCount) {
            return sum + g.grantCount;
        }
        return sum + 1;
    }, 0);

    return {
        totalGrantees: grantees.length,
        totalFunding: totalFunding,
        officialTotalFunding: 11880438, // Official NJCIC figure
        totalGrants: totalGrants,
        lastUpdated: new Date().toISOString().split('T')[0],
        dataSource: 'Airtable - Grants to date: NJ Civic Info Consortium',
        note: 'Data synced from Airtable. Organizations with multiple grants are consolidated.'
    };
}

/**
 * Main sync function
 */
async function syncFromAirtable() {
    console.log('Starting Airtable sync...\n');

    // Load existing data for coordinate lookup
    const existingGrantees = loadExistingData();
    const lookup = createLookupMap(existingGrantees);
    console.log(`Loaded ${existingGrantees.length} existing grantees for coordinate lookup\n`);

    // Fetch all records from Airtable
    console.log('Fetching records from Airtable...');
    const records = await fetchAllRecords();
    console.log(`\nFetched ${records.length} total records from Airtable\n`);

    // Transform records
    console.log('Transforming records...');
    const grantees = transformRecords(records, lookup);
    console.log(`Created ${grantees.length} grantee entries\n`);

    // Calculate metadata
    const metadata = calculateMetadata(grantees);

    // Create output
    const output = {
        grantees: grantees,
        metadata: metadata
    };

    // Write to file
    const outputPath = path.join(__dirname, '..', 'data', 'grantees.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\nWritten to ${outputPath}`);

    // Summary
    console.log('\n=== Sync Summary ===');
    console.log(`Total grantees: ${metadata.totalGrantees}`);
    console.log(`Total grants: ${metadata.totalGrants}`);
    console.log(`Total funding: $${metadata.totalFunding.toLocaleString()}`);
    console.log(`Last updated: ${metadata.lastUpdated}`);

    // Check for grantees missing coordinates
    const missingCoords = grantees.filter(g => {
        const normalizedName = g.name.toLowerCase().trim();
        return !lookup.has(normalizedName);
    });

    if (missingCoords.length > 0) {
        console.log(`\n⚠️  ${missingCoords.length} grantees using default county coordinates:`);
        missingCoords.forEach(g => console.log(`   - ${g.name} (${g.county})`));
        console.log('\nConsider running the geocoding script to get precise coordinates.');
    }
}

// Run sync
syncFromAirtable().catch(err => {
    console.error('Sync failed:', err);
    process.exit(1);
});
