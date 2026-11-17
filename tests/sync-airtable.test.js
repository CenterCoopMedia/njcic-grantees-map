const assert = require('node:assert/strict');
const test = require('node:test');
const { transformRecords, calculateMetadata, parseCsv } = require('../scripts/sync-airtable.js');

test('MAP VIEW grants group by organization and preserve cents and Current', () => {
    const records = [
        { fields: {
            Grantee: 'Example News: First project', 'Project Name': 'First project',
            'Total Awarded': '$100.25', 'Year(s) granted:': ['2024', '2025'],
            'Awarded in 2024': 60.10, 'Awarded in 2025': 40.15,
            'Focus area': ['Civic Engagement'], Current: false, County: 'Essex'
        } },
        { fields: {
            Grantee: ' example news : Second project ', 'Project Name': 'Second project',
            'Total Awarded': '$30.50', 'Year(s) granted:': ['2026'],
            'Awarded in 2026': 30.50, 'Focus area': ['Capacity Building'], Current: true,
            Lat: '40,7357', Long: '-74,1724', City: 'Newark', 'Service area': 'Essex County'
        } },
        { fields: { Grantee: 'Cancelled News', 'Total Awarded': 90000, 'Returned/Cancelled grant?': true } },
        { fields: { 'Total Awarded': 90000 } }
    ];
    const grantees = transformRecords(records);
    assert.equal(grantees.length, 1);
    const [organization] = grantees;
    assert.equal(organization.name, 'Example News');
    assert.equal(organization.amount, 130.75);
    assert.equal(organization.totalAmount, 130.75);
    assert.equal(organization.grantCount, 2);
    assert.equal(organization.isCurrent, true);
    assert.deepEqual(organization.years, ['2024', '2025', '2026']);
    assert.deepEqual(organization.awardsByYear, { 2024: 60.10, 2025: 40.15, 2026: 30.50 });
    assert.deepEqual(organization.focusAreas, ['Civic Engagement', 'Capacity Building']);
    assert.deepEqual(organization.grants.map(g => [g.projectName, g.isCurrent]), [
        ['First project', false], ['Second project', true]
    ]);
    assert.equal(organization.lat, 40.7357);
    assert.equal(organization.lng, -74.1724);
    assert.equal(organization.county, 'Essex County');
    const metadata = calculateMetadata(grantees, 'synthetic fixture');
    assert.equal(metadata.totalGrantees, 1);
    assert.equal(metadata.totalGrants, 2);
    assert.equal(metadata.totalFunding, 130.75);
    assert.equal(metadata.currentGrantees, 1);
    assert.equal(metadata.dataSource, 'synthetic fixture');
});

test('per-year awards supply missing totals and years; County supplies coordinates', () => {
    const [organization] = transformRecords([{ fields: {
        Grantee: 'County News', County: 'Mercer', 'Awarded in 2025': '$10.10',
        'Awarded in 2026': '$20.20', Current: 'Yes', 'Press Forward Grant?': true,
        'New org?': 'checked', 'Grant purpose': 'to report local news'
    } }]);
    assert.equal(organization.amount, 30.30);
    assert.deepEqual(organization.years, ['2025', '2026']);
    assert.equal(organization.lat, 40.2206);
    assert.equal(organization.lng, -74.7597);
    assert.equal(organization.city, 'Trenton');
    assert.equal(organization.isCurrent, true);
    assert.equal(organization.pressForward, true);
    assert.equal(organization.isNewOrg, true);
    assert.equal(organization.description, 'Received funding to report local news');
});

test('CSV input preserves quoted commas, quotes, and multiline grant descriptions', () => {
    const records = parseCsv('Grantee,Project Name,Grant purpose,Total Awarded\r\n' +
        '"Example, Inc.","Project ""One""","First line\nSecond line","$1,234.56"\r\n\r\n');
    assert.equal(records.length, 1);
    assert.deepEqual(records[0].fields, {
        Grantee: 'Example, Inc.', 'Project Name': 'Project "One"',
        'Grant purpose': 'First line\nSecond line', 'Total Awarded': '$1,234.56'
    });
    const [organization] = transformRecords(records);
    assert.equal(organization.amount, 1234.56);
    assert.equal(organization.projectName, 'Project "One"');
    assert.equal(organization.description, 'First line Second line');
});
