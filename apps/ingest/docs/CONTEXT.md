# Geography

This context defines the language for source-derived geographical areas, regional hierarchy, and spatial assignment.

## Language

Region:
A source-derived geographical area at any level of the hierarchy (e.g., country, province, municipality, neighborhood). Regions are the primary entities for organizing location-based data.
_Avoid_: Location when referring to hierarchical geographical areas; use Location only for informal UI language or physical points/addresses.

Source Observation:
A source-specific description of a Region that may create, enrich, or correct the canonical Region over time.
_Avoid_: Treating source records as Regions themselves.

School:
A driving school with its own physical coordinates that can be assigned to a containing Region.
_Avoid_: Defining a School's place only by a Region relationship.

## Relationships
- Unified Hierarchy: Regions are organized in a single tree structure using a `parentId` reference (Adjacency List).
- Level Classification: A Region may be classified by its apparent level or role, but that classification does not make it a separate kind of entity.
- Deepest Region Assignment: Schools are linked to the most specific (deepest) region in the hierarchy (e.g., a Neighborhood or District).
- Assignable Boundary: A Region should have a boundary before it can receive spatial school assignments.
- Grouping Region: A Region may exist to preserve hierarchy even when it has no observed boundary; grouping Regions are not direct targets for spatial school assignment.
- Source-Specific Identifiers: Regions store explicit IDs from different sources (e.g., `idealista_id`, `ine_id`) to facilitate merging and lookup.
- Source Observations: Source-specific rows, such as Idealista rows, may create, enrich, or correct canonical Regions but are not themselves the canonical Region.
- Source-Derived Reality: Regions represent the system's reconciled model of available source evidence, not independently surveyed real-world boundaries.
- Rebuild-Scoped Identity: Region IDs are internal identities and are not guaranteed to remain stable across source-driven rebuilds.

## Feature Categories
Regions aggregate data from multiple sources into specific categories:
- Names: The display name of the region according to different sources (e.g., `idealista_name`, `ine_name`).
- Geometries: The spatial boundaries of the region (e.g., `idealista_geometry`, `osm_geometry`).

Region Stats:
Aggregated metrics associated with a Region (e.g., population, mean salary). These are stored in a separate table to keep the core Region table lean.

## Requirements
- Spatial Querying: The system must support spatial queries (e.g., "find schools in this region", "nearest school to this point"). SpatiaLite is the preferred technology for this.
