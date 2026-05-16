# Assign schools to deepest containing Regions

## Parent

[PRD: Idealista Region ingest](../apps/ingest/docs/idealista-region-ingest-prd.md)

## What to build

Add the spatial assignment behavior that assigns schools to Regions using each school's own physical coordinates. The assignment should choose the deepest containing boundary-bearing Region and keep schools independent from rebuild-scoped Region identity.

## Acceptance criteria

- [ ] Given school coordinates and candidate Region boundaries, the assignment chooses a containing Region.
- [ ] When multiple containing Regions match, the deepest boundary-bearing Region is selected.
- [ ] Grouping Regions without boundaries are never selected as direct assignment targets.
- [ ] Schools retain their own coordinates and can be reassigned after a Region rebuild.
- [ ] Tests cover nested Regions, grouping Regions, and coordinates outside all Regions.

## Blocked by

- [Rebuild canonical Regions from a staged Idealista artifact](./0004-rebuild-regions-from-staged-idealista-artifact.md)
