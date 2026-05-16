# Add one local initialization command for Idealista Regions

## Parent

[PRD: Idealista Region ingest](../apps/ingest/docs/idealista-region-ingest-prd.md)

## What to build

Provide one local command that initializes Idealista-seeded Regions by running fetch, validation, snapshot hash checking, and rebuild in sequence. The underlying fetch and rebuild modules should remain independently runnable for debugging and reruns.

## Acceptance criteria

- [ ] A single command can run the full local Idealista Region initialization flow.
- [ ] The command validates the staged artifact before rebuilding canonical Regions.
- [ ] The command uses snapshot hash behavior to report unchanged snapshots before rebuilding.
- [ ] Fetch and rebuild can still be run separately.
- [ ] Command output summarizes artifact path, row counts, errors, hash status, and rebuild outcome.
- [ ] Tests or command-level checks cover the non-live flow using local fixtures.

## Blocked by

- [Detect unchanged Idealista snapshots before rebuild](./0005-detect-unchanged-idealista-snapshots.md)
- [Fetch a live Idealista snapshot into the staged artifact format](./0006-fetch-live-idealista-snapshot.md)
