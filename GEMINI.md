# MiCarnet

MiCarnet is a two-sided marketplace for Spanish driving schools ("autoescuelas") where:

- students discover, compare, and connect with schools.
- schools market themselves, analyze leads, and streamline operations.

## Development Guidelines

### Monorepo Rules

- Deployable applications belong in `apps/`.
- Shared logic, schemas, configs, and utilities belong in `packages/`.
- Apps may consume packages, but packages must never import from `apps/`.
- Define all Drizzle database schemas and types in `packages/db` to maintain a single source of truth.

### Typescript Conventions

- Prioritize clarity, explicit intent, and brevity over clever abstractions.
- Write self-documenting code by using descriptive names for functions, variables, and types.
- Only add comments for non-obvious logic or context that connot be inferred from the code.
- Use `unknown` instead of `any` if a type is truly unknown.
- Prefer type narrowing over type assertions. Use `as const` for immutable values and literal types.

### Error Handling

- Throw descriptive `Error` objects.
- Prefer early returns over deeply nested conditionals for error/guard cases.

## Security & Performance

- Add `rel="noopener"` on `target="_blank"` links.
- Avoid `dangerouslySetInnerHTML` unless strictly necessary.
- Use Next.js `<Image>` over `<img>`; avoid barrel/index re-export files.

### Skills

- Consult a skill when one exists for an area you're working in. For example:
  - Use the /vercel-react-best-practices and /next-best-practices skills when working in `apps/web/`
  - Use the /better-auth-best-practices skill when working in `packages/auth/`
  - Use the /shadcn skill when working on components in `packages/ui/`
