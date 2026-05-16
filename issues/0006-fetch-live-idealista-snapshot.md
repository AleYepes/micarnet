# Fetch a live Idealista snapshot into the staged artifact format

## Parent

[PRD: Idealista Region ingest](../apps/ingest/docs/idealista-region-ingest-prd.md)

## What to build

Add the live Idealista fetch command that retrieves the complete tree, labels, and polygons into the staged artifact format. This is a HITL slice because live Idealista access may require browser/session handling and manual verification of scraping behavior.

## Acceptance criteria

- [ ] The command fetches the Idealista Region tree from the live source.
- [ ] The command fetches names and polygon geometry needed for staged Source Observations.
- [ ] The command writes the same staged artifact and manifest format validated by the artifact slice.
- [ ] Partial fetch failures are summarized in the manifest rather than silently ignored.
- [ ] The canonical Region tables are not modified by this fetch command.
- [ ] Any manual browser/session steps are documented in command output or docs.

## Blocked by

- [Write and validate complete staged Idealista artifacts](./0003-write-validate-staged-idealista-artifacts.md)
