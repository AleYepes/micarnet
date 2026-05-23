# Add a local import and rebuild command for Idealista Regions

## Parent

[PRD: Idealista Region ingest](../apps/ingest/docs/idealista-region-ingest-prd.md)

## What to build

Provide a local CLI command (or script) in the `ingest` app that handles importing a raw harvested output folder/file (produced by the Python harvester), staging and validating it as a local staged artifact, and then rebuilding the canonical Regions from it. The underlying import and rebuild modules should remain independently runnable.

## Acceptance criteria

- [ ] A single CLI command can read a raw harvested output directory, stage/validate it, and rebuild canonical Regions.
- [ ] The command validates the staged artifact, reporting any errors or statistics (assignable vs. grouping counts).
- [ ] The import/staging phase and the database rebuilding phase can still be run separately.
- [ ] Command output clearly summarizes the imported file path, row counts, validation errors (if any), and rebuild outcome.
- [ ] Tests or command-level checks cover the import and rebuild flow using local fixtures.

## Blocked by

- [Rebuild canonical Regions from a staged Idealista artifact](./0004-rebuild-regions-from-staged-idealista-artifact.md)
