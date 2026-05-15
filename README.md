# micarnet

MiCarnet is a two-sided marketplace for Spanish driving schools ("autoescuelas") where:

- students discover, compare, and connect with schools.
- schools market themselves, analyze leads, and streamline operations.

## Features

- Web app: Fullstack Next v16+ with Typescript v5+
- Styling: Tailwind CSS v4+ with shadch/ui components
- Database: SQLite with Drizzle ORM
- Deployment: Coolify and Docker
- APIs: oRPC for end-to-end type-safety with OpenAPI integration
- Package manager: pnpm
- Build system: Turborepo v2.5+
- Payments: Stripe
- Authentication: Better-Auth v1.3+
- Linting and formatting: Biome with Ultracite presets
- Captcha: Vercel BotID
- Autofill: Meilisearch
- Unit testing: Vitest
- Component testing: React testing library
- End-to-end testing: Playwright

## Getting Started

First, install the dependencies:

```bash
pnpm install
```

## Database Setup

This project uses SQLite with Drizzle ORM.

1. Start the local SQLite database (optional):

```bash
pnpm run db:local
```

2. Update your `.env` file in the `apps/web` directory with the appropriate connection details if needed.

3. Apply the schema to your database:

```bash
pnpm run db:push
```

Then, run the development server:

```bash
pnpm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the fullstack application.

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@micarnet/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Git Hooks and Formatting

- Initialize hooks: `pnpm run prepare`

## Project Structure

```
micarnet/
├── apps/            # Deployable entry points
│   ├── web/         # Fullstack application (Next.js)
│   ├── ingest/
│   └── ...
├── packages/        # Shared, cross-cutting modules
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── api/         # API layer / business logic
│   ├── auth/        # Authentication configuration & logic
│   ├── db/          # Database schema & queries
│   ├── config/
│   ├── env/
│   └── ...
```

## Available Scripts

- `pnpm run dev`: Start all applications in development mode
- `pnpm run build`: Build all applications
- `pnpm run dev:web`: Start only the web application
- `pnpm run check-types`: Check TypeScript types across all apps
- `pnpm run db:push`: Push schema changes to database
- `pnpm run db:generate`: Generate database client/types
- `pnpm run db:migrate`: Run database migrations
- `pnpm run db:studio`: Open database studio UI
- `pnpm dlx ultracite fix`: Format code
- `pnpm dlx ultracite check`: Check for issues
- `pnpm dlx ultracite doctor`: Diagnose ultracite setup
- `pnpm run db:local`: Start the local SQLite database
