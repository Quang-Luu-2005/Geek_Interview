# Coding Guidelines

## Runtime and commands

- Node.js 22 LTS, pinned by `.nvmrc`.
- npm is the package manager; `package-lock.json` is committed.
- Run `npm ci` for a clean install.
- Run `npm run ci` before opening a pull request.

## Module boundaries

Each business module lives under `src/modules/<module>` and follows:

```text
presentation/controller -> application/use-case -> domain -> infrastructure/repository
```

Controllers parse HTTP input, invoke a use case, and map the result to a
response. They do not contain pricing, state-transition, locking, or transaction
logic. Use cases own business workflows and transaction boundaries. Repositories
own persistence operations behind explicit ports.

Shared code belongs under `src/shared` only when it is genuinely cross-module;
do not use it as a dumping ground for business rules.

## Naming

- Classes and types: `PascalCase`.
- Functions, variables, files and directories: `camelCase` for symbols and
  `kebab-case` for multi-word files/directories.
- Use-case names are verbs, for example `CreateBookingUseCase`.
- Test files end in `.spec.ts`; test names describe an observable behavior.
- Database columns use `snake_case`; API fields use `camelCase`.

## Errors and transactions

Use stable machine-readable business error codes. Map them to HTTP at the
presentation boundary. A transaction must be opened by the application use case
and passed through repository ports; repositories must not silently create
independent transactions. Never make external network calls inside the critical
booking transaction.

## Adding a new API

1. Define request, response, errors, and authorization rules.
2. Add validation DTOs in the presentation layer.
3. Add an application use case and domain policy.
4. Add repository ports and infrastructure implementation only if persistence is
   required.
5. Add OpenAPI documentation and a Postman example.
6. Add unit tests for pure rules and integration tests for database behavior.
7. Run `npm run format:check`, `npm run lint`, `npm run typecheck`, and the
   relevant test command.

### API addition checklist

Use this order for a new endpoint:

```text
request DTO -> controller boundary -> application use case -> repository port
-> infrastructure SQL -> OpenAPI path/schema -> Postman example
-> unit policy test -> PostgreSQL integration test -> README/API matrix link
```

Before opening a PR, verify that the endpoint has:

- explicit actor/ownership and stable error codes;
- `class-validator` DTO constraints with `whitelist` and
  `forbidNonWhitelisted` behavior covered;
- one transaction boundary when multiple correctness-sensitive writes are
  involved;
- an OpenAPI request/response/error example and a runnable Postman request;
- a unit test for deterministic rules and an integration test for persisted
  state; concurrency behavior belongs in `tests/concurrency/`;
- updated documentation only where the public behavior changed, plus a link
  from the reviewer-first README map.

Do not commit real credentials, generated build output, database dumps, or raw
machine-specific load artifacts. Keep reproducible summaries in `docs/` and
retain the command, environment and commit SHA used to produce them.
