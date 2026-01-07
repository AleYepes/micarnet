# Refactoring Plan: PostGIS Integration

## Phase 1: Infrastructure & Dependencies

Goal: Enable geospatial storage and processing capabilities.

1. Docker Upgrade:
   - Replace the standard `postgres` image in `docker-compose.yml` with `postgis/postgis:16-3.4` (or latest stable).
   - _Note:_ No data migration needed if starting fresh; otherwise, a dump/restore is required because the binary format changes.
2. ORM Config:
   - Update `drizzle-orm` to utilize PostGIS extensions.
   - Ensure your migration script enables the extension: `CREATE EXTENSION IF NOT EXISTS postgis;`

## Phase 2: Schema Refactoring (`geo`)

Goal: Transform the `geo` schema from a simple lookup list into a spatial reference system.

### 1. Existing Tables (Communities, Provinces, Municipalities)

- Keep: The `INE Code` primary keys (vital for linking DGT/Stats data).
- Add: `geom` column (Geometry Type: `MULTIPOLYGON`, SRID: 4326) to `municipalities`.
  - _Why:_ Allows coarse-grain filtering (e.g., "Show all schools in this Municipality").
  - _Source:_ Import massive municipality boundaries from CNIG/IGN or OSM.

### 2. New Table: `geo.neighborhoods` (The OSM Layer)

- Purpose: Stores the "Barrios" that official stats don't track but users search for.
- Source: OpenStreetMap (via Geofabrik extracts).
- Structure:
  - `id`: Serial/UUID.
  - `name`: Text (e.g., "Malasaña").
  - `geom`: `geometry(MULTIPOLYGON, 4326)` (The spatial boundary).
  - `municipality_id`: FK to `municipalities` (can be assigned spatially during import).
  - `source_id`: Text (OSM ID for updates).

## Phase 3: Schema Refactoring (`public`)

Goal: Make business entities spatially aware.

### 1. Update `school_locations`

- Add: `geom` column (`geometry(POINT, 4326)`).
  - _Role:_ The source of truth for calculations.
- Retain: `latitude` and `longitude` (Float).
  - _Role:_ Cache for the Frontend (React maps ingest simple floats faster than parsing WKT geometry).
- Add: `cartociudad_id`.
  - _Role:_ Unique immutable ID from the API to prevent duplicate imports of the same school.
- Refine: `municipality_id`.
  - _Strict Rule:_ Must be populated via the `muniCode` returned by CartoCiudad, not by string matching.

```typescript
// Example Drizzle Schema Concept
export const schoolLocations = pgTable("school_locations", {
  // ... existing fields ...
  // New Geospatial Field
  geom: geometry("geom", { type: "point", mode: "xy", srid: 4326 }),

  // External IDs
  cartociudadId: text("cartociudad_id"), // "13.PV.MUN_..."
  refCatastral: text("ref_catastral"), // Extra precision
});
```

## Phase 4: Data Ingestion Strategy (ETL)

Goal: Populate the new structure efficiently.

### 1. The "Base Map" Job (Run once / Monthly)

1. Download: OSM Spain Shapefile.
2. Filter: Extract `admin_level=9` (Suburbs) and `10` (Neighborhoods).
3. Spatial Join: Insert into `geo.neighborhoods`.
   - _Logic:_ If a neighborhood polygon is inside the Madrid Municipality polygon, link `municipality_id = 28079`.

### 2. The "School Import" Job (Worker)

1. Input: Raw DGT list (Excel/CSV).
2. Process: Loop through records.
3. API: Query CartoCiudad `/candidates` with the raw address.
4. Transform:
   - Extract `lat`, `lng`, `muniCode`.
   - Create PostGIS Point: `ST_SetSRID(ST_MakePoint(lng, lat), 4326)`.
5. Upsert: Save to `school_locations` ensuring `municipality_id` matches the `geo` table.

## Phase 5: Query Architecture (Runtime)

Goal: Low-latency search flow.

1. Client:
   - User selects "Sol, Madrid" (via Google Autocomplete).
   - Sends `GET /search?lat=40.41&lng=-3.70`.
2. Server (PostGIS Query):
   - Step 1 (Context): Identify the neighborhood.
     ```sql
     SELECT id, name, geom FROM geo.neighborhoods
     WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326));
     ```
   - Step 2 (Fetch): Get schools in that polygon.
     ```sql
     SELECT * FROM school_locations
     WHERE ST_Contains($neighborhood_geom, geom);
     ```
3. Result: Returns list of schools strictly within the polygon, instantaneous response.
