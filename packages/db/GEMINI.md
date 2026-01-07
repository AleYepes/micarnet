# Database Schema & Architecture

This package manages the PostgreSQL database using Drizzle ORM with PostGIS extensions for advanced geospatial capabilities.

## Schema Organization

### 1. `auth`

Manages BetterAuth identity, sessions, accounts, and verification tokens. Linked to `public` entities.

### 2. `geo`

Stores hierarchical administrative boundaries and shapes for Point-in-Polygon queries.

Hierarchy:

- `communities` (Admin Level 4)
- `provinces` (Admin Level 6)
- `municipalities` (Admin Level 8)
- `neighborhoods` (Admin Level 9-10)

### 3. `stats`

Contains official statistics (DGT school exam pass rates, population counts, business counts, regional income, etc) organized by metadata tables, often aggregated by province or municipality.

### 4. `public` (Default)

Contains the core application business logic (WIP)

- `schools`: Business entities.
- `school_locations`: Physical offices or practice tracks.
- `students` & `instructors`: User profiles linked to `auth` identities.
- Transactions: Packages, classes, bookings, and messaging records.
- Keying: Uses UUIDs for all internal records.

## Data Integration Sources

### 1. NIE

The primary source for administrative locations, not including neighborhoods, and for goventment statistics.

### 2. OpenStreetMap/Geofabrik

Location source to refine and elaborate official regions into PostGIS-compatible boundaries/polygons.

### 3. DGT Registry

The official list of certified driving schools and exams.

### 4. CartoCiudad

A Geocoding engine to validate and elaborate DGT data. Possibly

### 5. Places API

A second Geocoding engine to validate and elaborate DGT data. Primarily for reviews, images, and other rich business data.

## ID Strategy

- Administrative Data (`geo`): Uses official INE Codes stored as `text` strings to preserve leading zeros.
- Application Data (`public`): Uses random UUIDs for primary keys. External identifiers (like official DGT school codes) are stored as unique attributes.
- Auto-increment Integers: Used for internal logging or statistical rows.
