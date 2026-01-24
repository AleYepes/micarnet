# Refactoring Plan: Vanilla PostgreSQL & Turf.js Integration

We have decided to move away from PostGIS to simplify the infrastructure and leverage regular PostgreSQL with `jsonb` for geometry storage. Geospatial operations will be handled at the application/worker level using `turf.js`.

## Data Integration Sources

### 1. NIE

The primary source for administrative locations, not including neighborhoods, and for goventment statistics.

### 2. OpenStreetMap/Geofabrik

Location Polygon source to add neighborhoods and refine official regions and schools locations with point-in-polygon checks using turf.js.

### 3. DGT Registry

The official source for certified driving schools and exams in Spain.

### 4. Places API

A second Geocoding engine to validate and elaborate DGT data. Primarily for reviews, images, and other rich business data.

## Plan

### 1. Infrastructure Adjustments

- Use standard `postgres:18-alpine` image (already in `docker-compose.yml`).
- No need for `CREATE EXTENSION postgis`.
- Store geometries as GeoJSON objects in `jsonb` columns.

### 2. Database Schema

- Administrative tables (`communities`, `provinces`, `municipalities`, `neighborhoods`) use `jsonb("geometry")`.
- Point coordinates (e.g., in `school_locations`) use `doublePrecision` for `latitude` and `longitude`.

### 3. ETL Strategy (Worker)

#### Phase 1: Extract & Import (Current)

- Fetch administrative boundaries from OpenStreetMap (OSM) via Geofabrik PBF files.
- Use `osm-pbf-parser-node` to stream PBF data.
- Convert OSM relations to GeoJSON using `osmtogeojson`.
- Store raw GeoJSON in the database.

#### Phase 2: Transform & Clean (Future)

- Use `turf.js` for:
  - Validating and cleaning geometries.
  - Simplifying complex polygons to improve frontend performance.
  - Calculating centroids for mapping.
  - Performing point-in-polygon checks (e.g., assigning a school to a neighborhood).

### 4. Implementation Details

- **Storage**: `await db.insert(table).values({ ..., geometry: geojsonFeature.geometry })`
- **Retrieval**: Standard Drizzle queries.
- **Operations**: Fetch geometry from DB, process with `turf`, and optionally update or use for logic.

### 5. Benefits

- Reduced infrastructure complexity.
- Easier deployment (no special DB extensions).
- Full control over geospatial logic in TypeScript.
- Better performance for read-heavy operations where simplified GeoJSON is sufficient.
