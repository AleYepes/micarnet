# Database Schema & Architecture

This package manages the PostgreSQL database using Drizzle ORM. PostgreSQL Schemas organize data into logical domains for applications.

## Schema Organization

### 1. `auth`

Manages identity and session data.

- Includes: User identity, sessions, accounts, and verification tokens.
- Purpose: Provides core authentication. User profiles and roles link to this identity from the `public` schema.

### 2. `geo`

Stores administrative geographical data for Spain.

- Includes: Communities, Provinces, and Municipalities.
- Keying: Uses the official INE Code (Código INE) as the Primary Key (e.g., "28079" for Madrid).
- Implementation: Keys are stored as `text` types to preserve critical leading zeros (e.g., "01" for Andalucía).
- Note: This schema enables hierarchical filtering (Region -> Province -> Municipality). Sub-municipality precision relies on Postal Codes and coordinates.

### 3. `stats`

Contains third-party statistical data.

- Includes: DGT (Pass rates), INE (Population and Business counts).
- Structure: Tables are often aggregated by region or municipality. Metadata tables track source URLs and sync timestamps.

### 4. `public` (Default)

Contains the core application business logic.

- Entities:
  - `schools`: Business entities.
  - `school_locations`: Physical offices or practice tracks.
  - `students` & `instructors`: User profiles linked to `auth` identities.
- Transactions: Packages, classes, bookings, and messaging records.
- Keying: Uses UUIDs for all internal records.

## Data Integration Sources

### 1. DGT Registry (School Data)

The application pre-populates the `schools` and `school_locations` tables using the official DGT list of certified driving schools. This ensures comprehensive market coverage from launch.

### 2. CartoCiudad (Address Resolution)

To handle the bulk processing of DGT records, the application ingests the CartoCiudad dataset (approx. <1GB).

- Purpose: Resolves the raw addresses provided by the DGT into precise coordinates and normalized street names.
- Storage: The `school_locations` table stores:
  - Normalized Address: The official spelling.
  - Coordinates: Latitude and Longitude.
  - Reference IDs: CartoCiudad ID and Postal Code.
  - Administrative Link: A foreign key to the `geo` schema's Municipality.
  - Any other features we find (still need to explore)

## ID Strategy

- Administrative Data (`geo`): Uses official INE Codes stored as `text` strings to preserve leading zeros.
- Application Data (`public`): Uses random UUIDs for primary keys. External identifiers (like official DGT school codes) are stored as unique attributes.
- Auto-increment Integers: Used for internal logging or statistical rows.
