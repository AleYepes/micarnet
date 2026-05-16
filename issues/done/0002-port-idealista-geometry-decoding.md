# Port Idealista geometry decoding into staged source observations

## Parent

[PRD: Idealista Region ingest](../apps/ingest/docs/idealista-region-ingest-prd.md)

## What to build

Port the Idealista geometry decoding behavior from the Python reference into the ingest app as a pure, fixture-driven module. The output should be staged Source Observations with GeoJSON-like boundaries that can later feed Region rebuilds.

## Acceptance criteria

- [ ] Encoded Idealista path geometry can be decoded into polygon or multipolygon boundaries.
- [ ] Decoded staged Source Observations include source ID, optional parent source ID, name when available, and geometry.
- [ ] The decoder handles closed rings consistently and closes rings when needed.
- [ ] Representative fixtures cover single-ring and multi-ring geometry behavior.
- [ ] Tests exercise decoder behavior without live network calls.

## Blocked by

None - can start immediately
