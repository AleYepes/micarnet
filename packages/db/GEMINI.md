# Database Schema & Architecture

This package manages the PostgreSQL database using Drizzle ORM. We use **PostgreSQL Schemas** to organize data into logical domains.

## Schema Organization

### 1. `auth`
Managed by **Better-Auth**. Contains all identity and session data.
- `user`: Central user identity.
- `session`, `account`, `verification`.

### 2. `geo`
The administrative foundation of Spain.
- `communities`, `provinces`, `municipalities`.
- **Key Strategy**: Uses official **INE/DGT codes** (e.g., "28" for Madrid, "28079" for Madrid city) as Primary Keys for easy joining with government data.

### 3. `stats`
Holds third-party statistical data used for enrichment and analysis (INE, DGT, etc.).
- `metadata`: Tracks source URLs and last sync times.
- `buckets`: Employee count ranges.
- `stats_by_community` / `stats_by_municipality`: Pass rates, population, and business counts.

### 4. `public` (Default)
The core Marketplace engine.
- **Entities**: `schools` (The business), `school_locations` (The physical office/track), `students`, `instructors`.
- **Transactions**: `packages`, `classes`, `conversations`, `messages`.
- **Key Strategy**: Uses **UUIDs** for internal marketplace records.

## Development Workflow

- **Syncing**: Use `apps/worker` to fetch data from external APIs (INE) or scrapers (DGT) and populate the schemas.
- **Migrations**: During prototyping, we use `pnpm run db:push`. This may be destructive to current data in favor of schema speed.
- **Relationships**: A single `school` can have multiple `school_locations`. All location-based lookups should use the `geo` schema keys.
