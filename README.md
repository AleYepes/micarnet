# micarnet

This project was created with Better-T-Stack, a modern TypeScript stack that combines Next.js, Self, ORPC, and more.

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

## Getting Started

First, install the dependencies:

```bash
pnpm install
```

## Database Setup

This project uses PostgreSQL with Drizzle ORM.

1. Make sure you have a PostgreSQL database set up.
2. Update your `apps/web/.env` file with your PostgreSQL connection details.
3. Set up postgres:

```bash
cd packages/db/ && docker compose down -v && docker compose up -d
```

4. Apply the schema and populate the db:

```bash
pnpm run db:push
pnpm --filter worker start
```

5. Then, run the development server:

```bash
pnpm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see your fullstack application.

## Project Structure

```bash
micarnet/
├── apps/            # Deployable entry points
│   ├── web/         # Fullstack application (Next.js)
│   └── ...
├── packages/        # Shared, cross-cutting modules
│   ├── api/         # API layer / business logic
│   ├── auth/        # Authentication configuration & logic
│   ├── db/          # Database schema & queries
│   └── ...
```

## Available Scripts

- `pnpm run dev`: Start all applications in development mode
- `pnpm run build`: Build all applications
- `pnpm run check-types`: Check TypeScript types across all apps
- `pnpm run db:push`: Push schema changes to database
- `pnpm run db:studio`: Open database studio UI
- `pnpm dlx ultracite fix`: Format code
- `pnpm dlx ultracite check`: Check for issues
- `pnpm dlx ultracite doctor`: Diagnose ultracite setup
