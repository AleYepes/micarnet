# Rebuild a tiny canonical Region hierarchy from a local fixture

## Parent

[PRD: Idealista Region ingest](../apps/ingest/docs/idealista-region-ingest-prd.md)

## What to build

Build the smallest end-to-end Region ingest path: a local staged fixture is validated and rebuilt into canonical Regions in SQLite. The slice should prove the unified Region hierarchy, parent relationships, grouping Regions, and assignment eligibility without depending on live Idealista fetching.

## Acceptance criteria

- [ ] A local staged fixture can be loaded and rebuilt into canonical Region rows.
- [ ] Parent-child relationships are persisted as one unified Region hierarchy.
- [ ] Boundary-bearing Regions are marked as eligible for spatial assignment.
- [ ] Grouping Regions without boundaries can be preserved but are not direct assignment targets.
- [ ] The behavior is covered by tests that assert the observable rebuilt Region hierarchy.

## Blocked by

None - can start immediately
