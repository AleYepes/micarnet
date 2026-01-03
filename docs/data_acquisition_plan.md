# Data Acquisition & Management Plan

## Objective
To build the most comprehensive, accurate, and useful dataset of Spanish driving schools (*autoescuelas*) by synthesizing official government records with geospatial data and third-party enrichment.

## 1. Architecture: The "Worker" App
**Decision:** We will create a standalone application `apps/worker` to handle data ingestion, cleaning, and synchronization.
*   **Why:** Ensures strict separation of concerns. Heavy scraping dependencies (Playwright, etc.) will never pollute the `apps/web` bundle.
*   **Structure:**
    *   `apps/worker`: The executable Node.js application.
    *   `packages/db`: Shared Drizzle schema and client used by *both* `web` and `worker`.
    *   `packages/core`: (Optional) Shared business logic/types if needed.

## 2. The Foundation: Location Data (INE & CNIG)
**Problem:** DGT data contains corrupt or inconsistent location names. We need a "Source of Truth".

**Source 1: INE (Municipalities)**
*   **Strategy:** Use the official INE "Relación de municipios" CSV as a seed file.
*   **Action:** Create a seed script in `apps/worker` that parses this CSV and populates the `communities`, `provinces`, and `municipalities` tables.
*   **Source:** [INE Registry Download](https://www.ine.es/daco/daco42/codmun/codmun11/24codmun.xlsx) (We will convert this to CSV or JSON for the repo).

**Source 2: CNIG (Boundaries)**
*   **Strategy:** Download official boundaries to enable map visualizations.
*   **Action:** Import GeoJSON/Shapefiles into a PostGIS-enabled database (or store as simplified GeoJSON blobs if PostGIS is overkill).
*   **Source:** [CNIG Download Center](https://www.cnig.es/descargas/limites-municipales-provinciales-y-autonomicos) (Look for "Recintos municipales").

## 3. The Core: Autoescuela Registry (DGT)
**Problem:** Current Python scripts are proof-of-concepts.

**Strategy:**
1.  **Porting:** Re-implement `dgt_scraper.py` logic within `apps/worker` using TypeScript.
2.  **Normalization:**
    *   Scraper fetches a school -> Extracts raw text (e.g., "ALCALA DE HENARES").
    *   Worker attempts to match against `municipalities` table (e.g., "Alcalá de Henares").
    *   If match found: Link via Foreign Key.
    *   If no match: Flag for review.
3.  **Scheduling:** The worker can be run via a cron job (e.g., GitHub Actions or a cloud scheduler).

## 4. The Polish: Enrichment (Places API)
**Strategy:**
*   Once schools are validated, the `apps/worker` runs a specialized "Enrichment Job".
*   It queries Google Places API for metadata (images, reviews) and updates the record.

## Summary of Goals

| Phase | Goal | Deliverable |
| :--- | :--- | :--- |
| **Phase 1** | **Architecture Setup** | Initialize `apps/worker` in Turborepo and link it to `packages/db`. |
| **Phase 2** | **Location Authority** | Seed DB with INE Municipalities & Provinces. |
| **Phase 3** | **School Directory** | TS Scraper in `apps/worker` that populates the `schools` table. |
| **Phase 4** | **Stats & Enrichment** | Ingest exam stats and fetch Place photos/reviews. |

## Next Steps
1.  **Scaffold:** Create `apps/worker` package.
2.  **Schema:** Update `packages/db` with `provinces` and `municipalities` tables.
3.  **Seed:** Download the INE dataset and write the seeding script.