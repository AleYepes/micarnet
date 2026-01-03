# MiCarnet

## Features

- **TypeScript** - For type safety and improved developer experience
- **Next.js** - Full-stack React framework
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **shadcn/ui** - Reusable UI components
- **oRPC** - End-to-end type-safe APIs with OpenAPI integration
- **Drizzle** - TypeScript-first ORM for PostgreSQL
- **PostgreSQL** - Database engine
- **Authentication** - Better-Auth
- **Ultracite** - Biome-based linter and formatter
- **Husky** - Git hooks for code quality
- **Turborepo** - Optimized monorepo build system
- **Coolify** - Docker-based self-hosting

## Project Structure

```
micarnet/
├── apps/
│   └── web/         # Fullstack application (Next.js)
├── packages/
│   ├── api/         # API layer / business logic
│   ├── auth/        # Authentication configuration & logic
│   └── db/          # Database schema & queries
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
