# MiCarnet

The definitive platform for Spanish residents to find, vet, and enroll in driving schools, and for autoescuelas to manage their operations.

## Features

- TypeScript: For type safety and improved developer experience
- Next.js: Full-stack React framework
- TailwindCSS: Utility-first CSS for rapid UI development
- shadcn/ui: Reusable UI components
- oRPC: End-to-end type-safe APIs with OpenAPI integration
- Drizzle: TypeScript-first ORM for PostgreSQL
- PostgreSQL: Database engine
- Authentication: Better-Auth
- Ultracite: Biome-based linter and formatter
- Husky: Git hooks for code quality
- Turborepo: Optimized monorepo build system
- Coolify: Docker-based self-hosting

## Project Structure

```
micarnet/
├── apps/
│   ├── web/         # Fullstack application (Next.js)
│   └── worker/      # Background tasks, scraping, and data synchronization
├── packages/
│   ├── api/         # Shared API interfaces and business logic
│   ├── auth/        # Authentication configuration
│   └── db/          # Database schema and migrations
```

## Clean Architecture & Monorepo Principles

- Organize Directory Structure: Place deployable units (entry points) in `apps/` and shared, cross-cutting modules (logic, schema, configs) in `packages/`.
- Enforce Unidirectional Flow: Ensure apps consume packages, but packages never import from `apps/`.
- Centralize Data Models: Define all database schemas and types solely in `packages/db` to maintain a single source of truth.

## Available Scripts

- `pnpm run dev`: Start all applications in development mode
- `pnpm run build`: Build all applications
- `pnpm run check-types`: Check TypeScript types across all apps
- `pnpm run db:push`: Push schema changes to database
- `pnpm run db:studio`: Open database studio UI
- `pnpm dlx ultracite fix`: Format code
- `pnpm dlx ultracite check`: Check for issues
- `pnpm dlx ultracite doctor`: Diagnose ultracite setup