# Document the Idealista-first Region ingest workflow

## Parent

[PRD: Idealista Region ingest](../apps/ingest/docs/idealista-region-ingest-prd.md)

## What to build

Document the Idealista-first Region ingest workflow for future maintainers and agents. The documentation should explain how to fetch (using the Python harvester), import/stage, validate, rebuild, interpret manifests, and understand how later INE, OSM, and DGT Source Observations fit into the Region model.

## Acceptance criteria

- [ ] The docs explain the ingest pipeline architecture (Python harvesting separate from TS staging and rebuilding).
- [ ] The docs explain how to run the Python harvester and how to run the TS import/rebuild command.
- [ ] The docs explain how to rerun a rebuild from an already staged artifact.
- [ ] The docs describe grouping Regions, assignment eligibility, and rebuild-scoped Region IDs using glossary terms.
- [ ] The docs identify future enrichment sources as Source Observations rather than canonical Region owners.

## Blocked by

- [Rebuild canonical Regions from a staged Idealista artifact](./0004-rebuild-regions-from-staged-idealista-artifact.md)
- [Add a local import and rebuild command for Idealista Regions](./0008-local-initialization-command.md)
