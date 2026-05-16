# Detect unchanged Idealista snapshots before rebuild

## Parent

[PRD: Idealista Region ingest](../apps/ingest/docs/idealista-region-ingest-prd.md)

## What to build

Use staged artifact hashes and ingest-run metadata to determine whether an Idealista snapshot has changed since the last successful Region rebuild. The behavior should make unchanged snapshots explicit and avoid unnecessary rebuild work.

## Acceptance criteria

- [ ] The ingest flow can compare a staged artifact hash with prior successful ingest-run metadata.
- [ ] Unchanged staged artifacts are reported clearly and do not trigger a Region rebuild by default.
- [ ] Changed staged artifacts are reported as requiring rebuild.
- [ ] The behavior handles the first run when no prior metadata exists.
- [ ] Tests cover unchanged, changed, and first-run scenarios.

## Blocked by

- [Rebuild canonical Regions from a staged Idealista artifact](./0004-rebuild-regions-from-staged-idealista-artifact.md)
