# MiCarnet

The definitive platform for Spanish driving schools (autoescuelas). Its purpose is to help students find, vet, and enroll into driving schools, and to help driving schools generate leads and manage their operations.

## Features

- Web app: Fullstack Next v16+ with Typescript v5+
- Styling: Tailwind CSS v4+ with shadch/ui components
- Database: PostgreSQL with Drizzle ORM
- Deployment: Coolify and Docker
- APIs: oRPC for end-to-end type-safety with OpenAPI integration
- Runtime env & Package manager: pnpm
- Build system: Turborepo v2.5+
- Payments: Stripe
- Authentication: Better-Auth v1.3+
- Linting and formatting: Biome with Ultracite presets
- Captcha: Vercel BotID
- Autofill: Meilisearch
- Unit testing: Jest
- Component testing: React testing library
- End-to-end testing: Playwright

## Project Structure

```bash
micarnet/
├── apps/                       # Deployable entry points
│   ├── web/                    # Fullstack Next.js
│   │   ├── .next/
│   │   ├── node_modules/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── components/
│   │   │   ├── lib/
│   │   │   ├── ulits/
│   │   │   └── index.css
│   │   ├── .env
│   │   ├── ...
│   │   ├── next.config.ts
│   │   └── tsconfig.json
│   ├── ...
│   └── worker/                 # Background scraping, tasks, and data synchronization
│
├── packages/                   # Shared, cross-cutting modules
│   ├── api/                    # Shared API interfaces and business logic
│   │   ├── node_modules/
│   │   ├── src/
│   │   ├── package.json
│   │   ├── ...
│   │   └── tsconfig.json
│   ├── ...
│   ├── auth/                   # Authentication configuration
│   └── db/                     # Database schema and migrations
│       ├── node_modules/
│       ├── src/
│       ├── package.json
│       ├── ...
│       └── tsconfig.json
│
├── node_modules/               # Monorepo dependencies
├── ...
└── turbo.json
```

## Monorepo Principles

- Place deployable units (entry points) in `apps/` and shared, cross-cutting modules (logic, schema, configs) in `packages/`.
- Enforce unidirectional flow, ensuring that apps consume packages, but packages never import from `apps/`.
- Define all database schemas and types solely in `packages/db` to maintain a single source of truth.
- Use skills when applicable

## Testing and Debugging

- Write concise yet informative console logs that describe the faulty objects/errors being debugged. Do not log uninsighful notifications.

## Available Scripts

- `pnpm run dev`: Start all applications in development mode
- `pnpm run build`: Build all applications
- `pnpm run check-types`: Check TypeScript types across all apps
- `pnpm run db:push`: Push schema changes to database
- `pnpm run db:studio`: Open database studio UI
- `pnpm dlx ultracite fix`: Format code
- `pnpm dlx ultracite doctor`: Diagnose ultracite setup
