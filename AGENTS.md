# MiCarnet
A two-sided marketplace for Spanish driving schools.
## Rules
- Define all Drizzle schemas in `packages/db`.
- Packages must never import from `apps/`.
- Prefer type narrowing over `as Type` assertions.
- Include context (IDs, states) in Error objects.
- Only add comments if they cannot be inferred from the code.