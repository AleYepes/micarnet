# Document the Idealista-first Region ingest workflow

## Parent

[PRD: Idealista Region ingest](../apps/ingest/docs/idealista-region-ingest-prd.md)

## What to build

Document the Idealista-first Region ingest workflow for future maintainers and agents. The documentation should explain how to fetch, validate, rebuild, rerun from artifacts, interpret manifests, and understand how later INE, OSM, and DGT Source Observations fit into the Region model.

## Acceptance criteria

- [ ] The docs explain the staged artifact workflow and why fetching is separate from rebuilding.
- [ ] The docs explain how to rerun a rebuild from an existing artifact without refetching Idealista.
- [ ] The docs explain manifest fields, snapshot hashes, and unchanged snapshot behavior.
- [ ] The docs describe grouping Regions, assignment eligibility, and rebuild-scoped Region IDs using glossary terms.
- [ ] The docs identify future enrichment sources as Source Observations rather than canonical Region owners.

## Blocked by

- [Rebuild canonical Regions from a staged Idealista artifact](./0004-rebuild-regions-from-staged-idealista-artifact.md)
- [Add one local initialization command for Idealista Regions](./0008-local-initialization-command.md)
