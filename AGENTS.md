# MiCarnet
A two-sided marketplace for Spanish driving schools.
## Rules
- Define all Drizzle schemas and schema-inferred types in `packages/db`.
- Packages must never import from `apps/`.
- Prefer type narrowing over `as Type` assertions.
- Include context (IDs, states) in Error objects.
- Only add comments for non-obvious logic or context that cannot be inferred from the code.