# Rebuild canonical Regions from a staged Idealista artifact

## Parent

[PRD: Idealista Region ingest](../apps/ingest/docs/idealista-region-ingest-prd.md)

## What to build

Load a validated staged Idealista artifact and deterministically rebuild canonical Regions from it. The completed slice should replace the tiny fixture-only path with the real staged-artifact path while preserving the Region semantics already proven by the first slice.

## Acceptance criteria

- [ ] A validated staged Idealista artifact can rebuild canonical Regions end to end.
- [ ] Rebuild behavior is deterministic for the same staged artifact.
- [ ] The rebuilt hierarchy uses one Region table with parent relationships rather than separate tables per level.
- [ ] Grouping Regions are preserved when needed, while only boundary-bearing Regions are direct assignment targets.
- [ ] Rebuild metadata records the staged artifact identity and summary.
- [ ] Tests assert observable database state after rebuilding from staged fixtures.

## Blocked by

- [Write and validate complete staged Idealista artifacts](./0003-write-validate-staged-idealista-artifacts.md)
