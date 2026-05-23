# Idealista Region Ingest Refactor Plan

## Purpose

This document is for a fresh agent taking over the `apps/ingest/src/regions` submodule.

The current implementation has drifted into depending on a local `regions_*.jsonl` file shaped like the Python reference script output. That is not the desired architecture. The Python script in `docs/python-references/harvest_idealista_regions.py` is reference material only: it proves useful Idealista endpoints and geometry decoding behavior exist, but the TypeScript ingest worker must fetch and transform Idealista Region data itself.

Read these first:

- `apps/ingest/docs/CONTEXT.md` for the domain language.
- `apps/ingest/docs/idealista-region-ingest-prd.md` for product requirements.
- `docs/python-references/harvest_idealista_regions.py` only as endpoint/decoder reference, not as an input contract.

## Target Outcome

The public command should be:

```sh
pnpm --filter @micarnet/ingest run regions:idealista
```

It should run the complete Idealista Region ingest:

```text
fetch Idealista source data
-> build minimal Source Observations in memory
-> validate observations
-> rebuild canonical Regions in SQLite
-> record ingest metadata
-> print summary
```

It must not require a local Python-generated harvest folder or JSONL file.

## Current Problem

At the time of writing, the submodule has these responsibilities:

- `apps/ingest/src/index.ts`
  - CLI entrypoint.
  - Loads DB configuration and calls Region initialization.
  - Recent work moved it away from requiring unrelated web/auth env, but verify current code before editing.

- `apps/ingest/src/regions/idealista-region-initialization.ts`
  - Misleadingly named. It currently imports a local Python-harvest-shaped `regions_*.jsonl` file.
  - It expects fields like `shortUri`, `parent_shortUri`, `rings`, and `geometry`.
  - It then writes a staged artifact and rebuilds Regions.

- `apps/ingest/src/regions/idealista-staged-artifact.ts`
  - Writes and validates `observations.json` and `manifest.json`.
  - The artifact format is close to the desired internal Source Observation shape, but artifact files should not be required for the default worker path.

- `apps/ingest/src/regions/idealista-geometry.ts`
  - Decodes Idealista encoded path strings into `RegionBoundary`.
  - This is useful and should be part of the real fetch pipeline.

- `apps/ingest/src/regions/rebuild-regions.ts`
  - Rebuilds canonical `regions` from a validated staged artifact.
  - It currently reads observations from files. It should instead accept validated in-memory observations.

The important issue: the worker is operationally blocked unless `/data/idealista_harvest` exists. That should be removed.

## Desired Module Shape

Refactor toward these modules:

- `idealista-client.ts`
  - Fetches Idealista source endpoints.
  - Responsible for HTTP, concurrency, timeouts, and useful error context.

- `idealista-tree.ts`
  - Flattens Idealista's nested Region tree into source IDs and parent source IDs.
  - Does not create canonical Regions.

- `idealista-geometry.ts`
  - Keeps the polyline/path decoder.
  - Exposes a function usable by the fetch pipeline.

- `idealista-observations.ts`
  - Combines fetched tree, labels/names, and path geometry into MiCarnet Source Observations.
  - Ignores Idealista listing totals, zoom metadata, parent names, ring counts, and other non-Region fields.

- `validate-region-observations.ts`
  - Validates the in-memory Source Observations before DB writes.

- `rebuild-regions.ts`
  - Rebuilds canonical `regions` from validated in-memory observations.
  - Writes ingest-run metadata.

- `run-idealista-region-ingest.ts`
  - Orchestrates fetch, transform, validate, rebuild, and summary.

- `apps/ingest/src/index.ts`
  - Thin CLI wrapper only.

## Source Observation Shape

The ingest pipeline should produce this internal shape:

```ts
type IdealistaRegionObservation = {
  sourceId: string;
  parentSourceId: string | null;
  name: string;
  level?: string;
  geometry?: RegionBoundary;
};
```

This is not the Idealista raw schema and not the Python script schema. It is MiCarnet's minimal Source Observation for Region creation.

Do not include:

- `total`
- `zooms`
- `parentName`
- `ring_count`
- `children_shortUris`
- raw Python-harvest fields

## Fetching Behavior

Use the Python reference only to identify proven behavior:

- tree endpoint: `https://mt1.idealista.com/11/tree/all-es-tree.json`
- path endpoint: `https://mt1.idealista.com/11/paths/es/{shortUri}`
- labels endpoint if it can be fetched reliably from Node without browser/session handling

The implementation should prefer normal Node `fetch`. If the label endpoint requires browser/session behavior, do not recreate the Python Playwright workflow blindly. Instead:

1. Make the failure explicit.
2. Keep the worker from partially rebuilding Regions.
3. Consider whether tree data alone contains enough names; if not, leave the worker failing with clear context until a maintainable label strategy exists.

Every thrown error should include useful context such as source URL, source ID, HTTP status, and phase.

## Artifact Policy

Do not make staging files part of the normal worker contract.

Default behavior should be in-memory:

```text
fetch -> observations -> validate -> rebuild
```

Artifact writing can remain as a library/debug capability if useful for tests or reproducible troubleshooting, but it must not be required for `regions:idealista`.

If debug artifacts are kept, prefer a single overwriteable path such as:

```text
data/idealista_regions_staged/latest/
```

Do not accumulate temp files by default.

## Validation Rules

Validate observations before touching canonical tables:

- duplicate `sourceId`
- missing `name`
- missing parent
- parent cycle
- invalid geometry
- assignable count
- grouping count

Boundary-bearing Regions are assignable. Boundaryless grouping Regions are preserved but not direct school assignment targets.

If validation fails, abort before DB writes.

## Rebuild Rules

`rebuild-regions.ts` should accept validated observations and run one transaction:

1. Delete old `idealista` Regions.
2. Delete old `idealista` Region ingest runs.
3. Insert the rebuilt Region hierarchy.
4. Compute `depth` from parent relationships.
5. Set `isAssignable` to `true` only when `geometry` exists.
6. Preserve grouping Regions without geometry.
7. Record compact ingest metadata: source, generated/fetched time, rebuilt time, row count, content hash, and validation/fetch error summary.

Do not fetch Idealista in `rebuild-regions.ts`.
Do not parse raw Idealista response shapes in `rebuild-regions.ts`.

## Database Scope

The ingest worker may assume the schema exists. It does not need to run migrations or create tables.

It should create its DB client without importing `@micarnet/db` root if that root validates unrelated web/auth env. Import schema definitions directly from `@micarnet/db/schema/regions`.

Only `DATABASE_URL` should be required for the Region ingest worker.

## Testing Plan

Use TDD with small vertical slices. Automated tests must not hit live Idealista.

Recommended tests:

1. `idealista-tree.test.ts`
   - Nested tree becomes flat `{ sourceId, parentSourceId }` entries.

2. `idealista-geometry.test.ts`
   - Representative encoded path strings decode into `Polygon` and `MultiPolygon` boundaries.

3. `idealista-observations.test.ts`
   - Mocked tree, label, and path responses produce minimal observations.
   - Irrelevant fields like `total` are ignored.

4. `validate-region-observations.test.ts`
   - Duplicate IDs, missing names, missing parents, cycles, and invalid geometry are reported.

5. `rebuild-regions.test.ts`
   - Valid observations rebuild canonical Regions.
   - Grouping Regions are preserved but not assignable.
   - Invalid observations do not touch the database.

6. `run-idealista-region-ingest.test.ts`
   - Mocked full worker fetches, builds observations, validates, rebuilds, and returns a summary.

Keep live Idealista fetching as a manual verification step only.

## Migration Steps

1. Add in-memory observation types and validation.
2. Refactor `rebuild-regions.ts` to accept observations directly.
3. Keep artifact-file rebuild tests temporarily if needed, but move the production path off files.
4. Add an Idealista client with mocked fetch tests.
5. Add tree flattening and observation-building modules.
6. Wire `run-idealista-region-ingest.ts`.
7. Simplify `apps/ingest/src/index.ts` to call only the full worker.
8. Remove the default local harvest path and Python-shaped JSONL parsing from the public path.
9. Delete or quarantine Python-harvest import helpers under an explicit debug/test name.
10. Run feedback loops:
    - `pnpm test`
    - `pnpm fix`
    - `pnpm typecheck`

## Acceptance Criteria

- `pnpm --filter @micarnet/ingest run regions:idealista` does not require `data/idealista_harvest`.
- The worker fetches Idealista source data itself.
- The worker stages observations in memory and validates before DB writes.
- Canonical `regions` are rebuilt only from MiCarnet Source Observations.
- Python-reference output is not a production input format.
- Idealista-only listing data such as `total` is never stored or carried into Region inputs.
- Debug artifact writing, if retained, is optional and not part of the normal command.
- Tests cover the full worker with mocked network responses.
