# Write and validate complete staged Idealista artifacts

## Parent

[PRD: Idealista Region ingest](../apps/ingest/docs/idealista-region-ingest-prd.md)

## What to build

Create the artifact path for staged Idealista Source Observations. Given Idealista-like source payloads, write the minimal staged observation set plus a manifest, then validate that the artifact is coherent enough to feed a canonical Region rebuild.

## Acceptance criteria

- [ ] The staged artifact stores the minimal critical fields: source ID, parent source ID, name, and geometry when available.
- [ ] A manifest is written with source metadata, fetched time or generated time, row count, content hash, and error summary.
- [ ] Validation reports duplicate source IDs, missing names, missing parents, parent cycles, and invalid geometry.
- [ ] Validation distinguishes assignable boundary-bearing observations from grouping observations without boundaries.
- [ ] Tests cover valid and invalid artifacts using local fixtures.

## Blocked by

- [Rebuild a tiny canonical Region hierarchy from a local fixture](./0001-rebuild-tiny-canonical-region-hierarchy.md)
- [Port Idealista geometry decoding into staged source observations](./0002-port-idealista-geometry-decoding.md)
