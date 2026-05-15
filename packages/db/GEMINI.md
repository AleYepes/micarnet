# Database Schema & Architecture

This package manages the PostgreSQL database shared by all apps.

## Schema Organization

### 1. `auth`

Manages BetterAuth identity, sessions, accounts, and verification tokens. Linked to `public` entities.

### 2. `geo`

Stores hierarchical administrative boundaries and shapes.

Hierarchy:

- `communities` (Admin Level 4)
- `provinces` (Admin Level 6) FK to `communities`
- `municipalities` (Admin Level 8) FK to `provinces`
- `neighborhoods` (Admin Level 9-10) FK to `municipalities`

### 3. `stats`

Contains official statistics (DGT school exam pass rates, population counts, business counts, regional income, etc) organized by metadata tables, often aggregated by province or municipality.

### 4. `public` (Default)

Contains the core application business logic (WIP)

- `schools`: Business entities.
- `students` & `instructors`: User profiles linked to `auth` identities.
- Transactions: Packages, classes, bookings, and messaging records.

## Formatting

- Use lower snake case column names
- Prefix column names according to their source when appropriate(`dgt_`, `osm_`, `ine_`, `idealista_`, etc)
