# Domain Glossary

## Region
A geographical area at any level of the hierarchy (e.g., country, province, municipality, neighborhood). Regions are the primary entities for organizing location-based data.

### Hierarchy
- **Unified Hierarchy**: Regions are organized in a single tree structure using a `parentId` reference (Adjacency List).
- **Deepest Region Assignment**: Schools are linked to the most specific (deepest) region in the hierarchy (e.g., a Neighborhood or District).
- **Source-Specific Identifiers**: Regions store explicit IDs from different sources (e.g., `idealista_id`, `ine_id`) to facilitate merging and lookup.

### Feature Categories
Regions aggregate data from multiple sources into specific categories:
- **Names**: The display name of the region according to different sources (e.g., `idealista_name`, `ine_name`).
- **Geometries**: The spatial boundaries of the region (e.g., `idealista_geometry`, `osm_geometry`).

## Region Stats
Aggregated metrics associated with a Region (e.g., population, mean salary). These are stored in a separate table to keep the core Region table lean.

### Requirements
- **Spatial Querying**: The system must support spatial queries (e.g., "find schools in this region", "nearest school to this point"). SpatiaLite is the preferred technology for this.
