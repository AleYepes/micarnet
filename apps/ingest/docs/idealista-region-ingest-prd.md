# PRD: Idealista Region Ingest

## Problem Statement

MiCarnet needs a reliable canonical Region model for Spain so schools can be assigned to meaningful geographical areas and users can search or filter schools by area. The current repo does not yet have Region schemas or an ingest implementation, while the existing Python reference proves that Idealista exposes a useful region hierarchy and polygons through public endpoints. The challenge is to bring that behavior into the TypeScript ingest app without treating Idealista rows as canonical Regions forever, because future source changes and enrichment from INE, OSM, or DGT may alter the system's reconciled Region model.

## Context

[CONTEXT: Idealista Region ingest](./CONTEXT.md)

## Solution

Build an Idealista-first Region ingest flow in the ingest app. The flow fetches a complete Idealista tree snapshot, labels, and polygons into a lightweight staged artifact, validates that staged source observations are coherent, and then rebuilds canonical Regions from the staged artifact. Idealista source observations are the primary seed for canonical Regions, but they are not themselves the Region. Schools remain independent records with physical coordinates and can be reassigned to the current canonical Region set after each Region rebuild.

## Job Stories

1. When I need to initialize MiCarnet's geography data, I want to fetch the complete Idealista Region hierarchy, so I can seed canonical Regions from the most useful available source.
2. When an Idealista fetch is interrupted or incomplete, I want the canonical Region table to remain untouched, so users and later ingest steps do not see a partially rebuilt hierarchy.
3. When I rerun a failed Region rebuild, I want to reuse a local staged artifact, so I can debug deterministic database behavior without refetching Idealista.
4. When Idealista changes its tree, I want the system to detect that the snapshot changed, so I know a new canonical Region rebuild and enrichment run is required.
5. When a staged Idealista row has a short URI, parent short URI, name, and polygon, I want it to be eligible for canonical Region creation, so the resulting Region can support spatial school assignment.
6. When a staged Idealista row has hierarchy value but no usable polygon, I want it preserved as a grouping Region, so breadcrumbs and parent-child navigation remain intact.
7. When a Region has no boundary, I want it excluded from direct spatial school assignment, so schools are only assigned to Regions that can actually contain their coordinates.
8. When the Idealista hierarchy contains mixed or ambiguous levels, I want all areas stored as one Region hierarchy, so I do not force uncertain rows into separate province, municipality, district, or neighborhood tables.
9. When a Region's level is known or inferred, I want that classification stored as descriptive metadata, so the model can support filtering without making classification the table boundary.
10. When schools are ingested or reassigned, I want their own coordinates to drive Region assignment, so schools can survive Region rebuilds without depending on stable Region IDs.
11. When future enrichment sources describe the same area with different names or polygons, I want those source observations reconciled into the canonical Region set, so MiCarnet can combine source evidence over time.
12. When the ingest job completes, I want a manifest containing source URL, fetch time, row count, content hash, and error summary, so I can audit what data produced the current Region model.

## Implementation Decisions

- Use **Region** as the canonical domain term. Avoid using "location" for hierarchical geographical areas.
- Treat an Idealista row as a **Source Observation** that may create, enrich, or correct a canonical Region.
- Treat a complete Idealista tree snapshot as a rebuild cue when its content hash changes.
- Do not promise stable Region IDs across rebuilds. Region IDs are internal row identities; schools keep their own identities and coordinates.
- Split the flow into two conceptual modules: an Idealista fetcher and a canonical Region rebuilder. A wrapper command may run both, but the modules should remain independently runnable.
- The Idealista fetcher should stage a complete local artifact before any canonical Region writes happen.
- Keep the Idealista staged payload minimal: source ID, parent source ID, name, and geometry are the critical fields. Tree depth may be derived and used for validation or diagnostics.
- Do not carry Idealista-only fields such as totals, zooms, ring counts, or parent names into canonical Region inputs unless a concrete later use appears.
- Use one canonical Regions table with an adjacency-list parent relationship and a descriptive classification field rather than separate tables per administrative level.
- Allow grouping Regions with no observed boundary when they preserve meaningful hierarchy, but do not assign schools directly to them.
- Promote only boundary-bearing Regions to direct spatial assignment targets.
- Store compact ingest-run metadata such as source name, fetched time, content hash, row count, and error summary. Avoid long-term normalized tables of every historical snapshot unless audit requirements become explicit.
- Region geometry should support spatial queries in SQLite with SpatiaLite.
- Future enrichment from INE, OSM, and DGT should be modeled as additional source observations and reconciliation steps rather than direct ownership of the Region identity.

## Testing Decisions

- Tests should exercise external behavior: given source observations or staged artifacts, the system produces the expected staged manifest, Region hierarchy, assignment eligibility, and diagnostics.
- Test the Idealista geometry decoder with representative encoded polygons and multipolygon-like inputs from the Python reference behavior.
- Test tree flattening and parent-child reconstruction from a small nested Idealista fixture.
- Test staged artifact validation for missing names, missing parents, duplicate short URIs, cycles, and missing or invalid geometry.
- Test canonical Region rebuild behavior from staged fixtures, including grouping Regions without boundaries and assignable Regions with boundaries.
- Test snapshot hash behavior so unchanged staged content does not force unnecessary rebuild work.
- Test school Region assignment through public behavior: given school coordinates and overlapping candidate Regions, assign the deepest containing boundary-bearing Region.
- Use focused fixtures rather than live Idealista network calls in automated tests.
- Live fetching should remain a manual or integration command because it depends on network behavior and may require browser/session handling.

## Out of Scope

- Full INE, OSM, or DGT enrichment implementation.
- A complete source reconciliation engine for all future data sources.
- Stable public Region IDs or SEO URL migration behavior.
- User-facing regional search UI.
- School ingestion beyond the requirement that schools retain physical coordinates and can be reassigned spatially.
- Persisting every historical Idealista snapshot in normalized database tables.
- Fuzzy matching rules for municipalities or official administrative code enrichment.

## Further Notes

- The current Python reference fetches more fields than the first ingest implementation needs. The TypeScript implementation should borrow the proven fetch and decode behavior but not mirror the Python output shape.
- Idealista is the primary seed source because its Regions are production-tested for user-facing search, but the canonical Region model remains source-derived and rebuildable.
- If Idealista updates its regional schema, the expected response is to stage the new complete snapshot, rebuild canonical Regions, rerun enrichment, and reassign schools by coordinates.
