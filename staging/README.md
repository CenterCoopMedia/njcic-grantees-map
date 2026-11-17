# Staging map preview

This noindex preview contains the Current-based key and filter, the 2026 year option, project titles, and per-year award tiles. It does not register a service worker.

It reads the live `../data/grantees.json` when that data contains the Current field; otherwise it reads the bundled November 9 CSV snapshot. The live JSON uses the server-side sync schema. The bundled CSV snapshot has rounded amounts and borrowed descriptions.

See [sync ownership](../docs/sync-ownership.md) for the server writer, dated public comparison, and hosting boundary. Repository changes do not upload or publish this preview.
