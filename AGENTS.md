# MiCarnet

MiCarnet is a two-sided marketplace for Spanish driving schools ("autoescuelas") where:

- students discover, compare, and connect with schools.
- schools market themselves, analyze leads, and streamline operations.

## Development Guidelines

### Monorepo Rules

- Deployable entry points belong in `apps/`.
- Shared logic, configs, and utilities belong in `packages/`.
- Packages must never import from `apps/`.
- Define all Drizzle schemas and schema-inferred types in `packages/db`.
- Packages should be framework-independent by default.

### Coding Conventions

- Use type narrowing or `as const`. Avoid `as Type` assertions.
- Never throw plain strings. Always include context (IDs, states, etc) in Error objects.
