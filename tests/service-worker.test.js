const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('the production worker leaves preview pages, scripts, and data to the browser', async () => {
    const handlers = new Map();
    const cached = { source: 'production cache' };
    const context = {
        URL,
        self: {
            registration: { scope: 'https://example.org/map/' },
            location: { origin: 'https://example.org' },
            addEventListener(name, handler) { handlers.set(name, handler); }
        },
        caches: { match() { return Promise.resolve(cached); } },
        fetch() { assert.fail('cached production script should not need the network'); }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8'), context);
    const handler = handlers.get('fetch');
    for (const resource of ['staging/', 'staging/index.html', 'staging/js/app.js?v=preview', 'staging/data/grantees.json']) {
        handler({
            request: { method: 'GET', url: `https://example.org/map/${resource}`, mode: 'navigate' },
            respondWith() { assert.fail(`preview request was intercepted: ${resource}`); }
        });
    }
    let response;
    handler({
        request: { method: 'GET', url: 'https://example.org/map/js/app.js?v=production', mode: 'cors' },
        respondWith(result) { response = result; }
    });
    assert.equal(await response, cached);
});
