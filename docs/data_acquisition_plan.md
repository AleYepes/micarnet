# Data Acquisition & Management Plan

## Objective

To build the most comprehensive, accurate, and useful dataset of Spanish driving schools (autoescuelas) by synthesizing official government records with geospatial data and third-party enrichment.

## 1. Architecture: The "Worker" App

App `apps/worker` to handle data ingestion, cleaning, and synchronization.
    - Ensures strict separation of concerns, so heavy scraping dependencies (Playwright, cheerio, etc.) don't pollute the `apps/web` bundle.
    - `apps/worker`: The executable Node.js application to collect data (DGT, INE, Google).
    - `packages/db`: Shared Drizzle schema and client used by -both- `web` and `worker`.

## 2. The Foundation: Location Data (INE & CNIG)

DGT data contains corrupt or inconsistent location data. We need varying sources to clean and validate the DGT data.

Source 1: INE (Municipalities)
    - Create a seed script in `apps/worker` that scrapes/calls the official INE "Relación de municipios" data, and populates `communities`, `provinces`, and `municipalities` tables.
    - Source: [INE Registry Download](https://www.ine.es/daco/daco42/codmun/codmun11/24codmun.xlsx).

Source 2: CNIG (Boundaries)
    - Import GeoJSON/Shapefiles into a PostGIS-enabled database (or store as simplified GeoJSON blobs if PostGIS is overkill).
    - Source: [CNIG Download Center](https://www.cnig.es/descargas/limites-municipales-provinciales-y-autonomicos) (Look for "Recintos municipales").

## 3. The Core: Autoescuela Registry (DGT)

A. Re-implement the python scripts (`dgt_scraper.py` and `exam_scraper.py`) within `apps/worker` using TypeScript.
B. Normalization:
    - Scraper fetches a school
    - Worker attempts to match school data against `municipalities` table (e.g., "Alcalá de Henares").
    - If match found: Link via Foreign Key.
    - If no match: Flag for review.

## 4. The Polish: Enrichment (Places API)

Once DGT school data is validated, the `apps/worker` can queries Google Places API for metadata (images, reviews) and elaborate the school data.
    - Consider creating new tables for large files with foreign keys to `schools`.