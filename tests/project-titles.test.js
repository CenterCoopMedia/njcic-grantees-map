const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

for (const file of ['js/app.js', 'staging/js/app.js']) {
    test(`${file} renders Airtable project titles as text in every modal`, () => {
        const elements = new Map();
        const document = {
            addEventListener() {},
            getElementById(id) {
                if (!elements.has(id)) elements.set(id, {
                    innerHTML: '', textContent: '', style: {},
                    classList: { add() {}, remove() {} }
                });
                return elements.get(id);
            }
        };
        const context = { document, navigator: {}, window: {}, setTimeout() {} };
        vm.createContext(context);
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);

        const projectName = '<img src=x onerror=alert(1)> & "quoted"';
        const encoded = '&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quoted&quot;';
        const grant = {
            name: 'Example News', years: ['2026'], amount: 10.25,
            description: '', focusAreaList: [], awardsByYear: {}, isCurrent: false
        };
        const organizations = [
            { ...grant, projectName },
            { ...grant, hasMultipleGrants: true, totalAmount: 20.50, grantCount: 2,
                grants: [{ ...grant, projectName }, { ...grant, projectName: 'Second project' }] }
        ];
        for (const organization of organizations) {
            context.openModal(organization);
            const html = elements.get('modal-details').innerHTML;
            assert.ok(html.includes(encoded));
            assert.ok(!html.includes('<img'));
        }
    });
}
