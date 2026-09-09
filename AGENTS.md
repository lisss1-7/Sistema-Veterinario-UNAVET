# AGENTS.md

## Project snapshot

This repo is a veterinary clinic management app with:

- Frontend: React + TypeScript + Vite in the project root
- Backend: Node.js + Express in `backend/`
- Database: MySQL, configured through `backend/.env`
- Auth: JWT-based API protection

For setup and module status, see [README.md](README.md).

## Working commands

Run these from the repo root unless noted otherwise:

- Install all frontend deps: `npm install`
- Install backend deps: `cd backend && npm install`
- Start both apps together: `npm run dev`
- Start frontend only: `npm run dev:frontend`
- Start backend only: `cd backend && npm run dev`
- Build frontend: `npm run build`
- Backend tests for AI reports: `cd backend && npm run test:reports`
- Verify email config: `cd backend && npm run verify:email`
- Normalize database data scripts: `cd backend && npm run migrate:<script-name>`

## Architecture and conventions

### Frontend

- The app entry is in [src/main.tsx](src/main.tsx) and the root app shell is in [src/app/App.tsx](src/app/App.tsx).
- Route configuration lives in [src/app/routes.ts](src/app/routes.ts).
- Most feature work belongs under [src/app](src/app), organized by screens and shared UI.
- The project uses Tailwind and MUI patterns already in the codebase; prefer matching existing components and styling conventions instead of introducing a new pattern.

### Backend

- Server bootstrap is in [backend/src/server.js](backend/src/server.js).
- Route registrations are grouped by module under [backend/src/routes](backend/src/routes).
- Controllers and business logic live under [backend/src/controllers](backend/src/controllers).
- Shared middleware and validation helpers are in [backend/src/middleware](backend/src/middleware) and [backend/src/utils](backend/src/utils).
- Database access is handled with MySQL connection pooling; keep database logic in the existing module structure.

### API conventions

- API routes are mounted under `/api/...` and most endpoints use JWT auth where the feature is user-scoped.
- Preserve module naming consistency with existing route/controller names.
- Prefer reusing current validation and error-handling patterns instead of creating a parallel style.
- If a feature depends on data from another module, follow the existing integration pattern rather than short-circuiting with ad hoc queries.

## Important project-specific notes

- The backend reads environment variables from [backend/.env](backend/.env) or a local equivalent.
- Local development usually runs frontend on port `5173` and backend on port `3001`.
- This project already includes AI report functionality; when changing reports or AI-related APIs, check [backend/src/routes/aiReportsRoutes.js](backend/src/routes/aiReportsRoutes.js) and the corresponding controller.
- The app is not purely CRUD; it includes reporting, normalization scripts, and clinic workflow modules. Keep changes consistent with the existing domain language (pacientes, historial, vacunación, grooming, inventario, citas, etc.).

## Editing guidance for agents

- Keep changes focused to the relevant module; avoid broad refactors unless asked.
- Preserve existing naming patterns and route structure.
- When adding backend endpoints, follow the current Express controller + route organization.
- When adding frontend screens or logic, fit them into the current router and app state structure instead of creating a separate app shell.
- Prefer small, reviewable changes and validate with the smallest relevant command.

## Documentation and references

- [README.md](README.md) for setup, environment variables, and project status
- [backend/package.json](backend/package.json) for backend scripts
- [package.json](package.json) for frontend scripts
## Strict modification rules

These rules must be followed whenever modifying this project.

### Before making changes

Before editing any file:

1. Inspect the file related to the user's request.
2. Inspect the components, services, routes, controllers, types, interfaces, and APIs directly related to it.
3. Determine how the current functionality works before changing it.
4. Identify the actual cause of an error instead of assuming it.
5. Check whether the requested behavior already exists elsewhere in the project and can be reused.

Do not start rewriting code before understanding the current implementation.

### Scope of changes

Only modify files that are necessary to complete the requested task.

Do not:

- perform unrelated refactors;
- reorganize folders unless explicitly requested;
- rename components, variables, functions, routes, services, or database fields without a clear need;
- remove existing functionality unless explicitly requested;
- replace working implementations simply because another implementation seems cleaner;
- introduce a new architecture when the current architecture can support the requested change;
- change unrelated modules while fixing another module.

Prefer the smallest change that correctly solves the requested problem.

### Existing functionality

Preserve all existing functionality unless the user explicitly asks for it to be removed or changed.

When modifying an existing screen, component, form, modal, table, report, or workflow:

- preserve current behavior that is unrelated to the request;
- preserve existing buttons and actions;
- preserve existing validations;
- preserve routes;
- preserve API integrations;
- preserve current business rules;
- preserve current database interactions unless the task requires changing them.

Never simplify a file by removing functionality that appears unrelated.

### User interface

Do not change the visual design unless the user explicitly requests a design change.

Preserve:

- layout;
- colors;
- spacing;
- typography;
- tables;
- buttons;
- modals;
- alerts;
- form structure;
- responsive behavior;
- existing Tailwind or MUI styling conventions.

When adding UI functionality, match the existing style of the surrounding module.

### Reference implementations

When the user provides another file, component, or module as a reference and asks for similar behavior:

1. Analyze the reference implementation.
2. Analyze the target implementation.
3. Identify only the behavior that needs to be replicated.
4. Adapt that behavior to the target module.
5. Preserve functionality that already exists in the target.

Do not replace the entire target file simply because a reference implementation was provided.

### Frontend rules

For React and TypeScript changes:

- preserve existing interfaces and types where possible;
- do not introduce `any` unnecessarily;
- verify imports after editing;
- reuse existing components and utilities;
- reuse existing API services when available;
- keep state management consistent with the surrounding code;
- preserve controlled form behavior;
- verify dropdowns, filters, modals, pagination, and validation after changes;
- do not hardcode values that should come from the API or database.

If a dropdown or list is populated from the database, trace the complete flow:

frontend component -> API request -> Express route -> controller -> database query.

Do not replace database-driven options with hardcoded frontend values.

### Backend rules

For Node.js and Express changes:

- preserve the existing route + controller architecture;
- use the existing MySQL connection pool;
- reuse validation and middleware patterns;
- preserve JWT protection on protected endpoints;
- do not expose endpoints that should require authentication;
- preserve existing error response conventions;
- use parameterized SQL queries;
- avoid duplicating business logic that already exists.

Before creating a new endpoint, check whether an existing endpoint already provides the required data.

### Database rules

Do not assume database table names, column names, relationships, or enum values.

Inspect the existing code, queries, migrations, or schema references first.

Never:

- drop tables;
- delete columns;
- rename columns;
- alter production data;
- run destructive migrations;

unless explicitly requested.

Do not modify `backend/.env` values unless explicitly requested.

Never expose secrets, passwords, JWT secrets, database credentials, API keys, or email credentials in generated code or responses.

### Bug fixing

When fixing a bug:

1. Reproduce or trace the problem from the available code.
2. Identify the root cause.
3. Fix the root cause rather than masking the symptom.
4. Check dependent functionality.
5. Avoid unrelated changes.

If the cause cannot be confidently determined from the available files, inspect additional relevant files before editing.

### File replacement

Do not rewrite an entire large file when a small targeted modification is sufficient.

If the user explicitly asks for the complete corrected file, provide the complete file while preserving all unrelated existing functionality.

Never omit code using placeholders such as:

- `// rest of code`
- `// existing implementation`
- `...`
- `// unchanged code here`

when a complete file has been requested.

### Dependencies

Do not install a new npm package unless:

1. the requested functionality genuinely requires it;
2. equivalent functionality does not already exist in the project.

Prefer existing dependencies.

### Validation after changes

After modifying code, perform the smallest relevant validation available.

For frontend TypeScript changes, use the appropriate build or type validation when possible.

For backend changes, verify syntax and use the relevant test command when available.

Before considering the task complete, check for:

- TypeScript errors;
- missing imports;
- invalid references;
- broken routes;
- incorrect API URLs;
- inconsistent property names;
- unintended removed behavior.

### Priority order

When implementing a request, priorities are:

1. Follow the user's explicit request.
2. Preserve existing functionality.
3. Follow the existing architecture.
4. Make the smallest necessary change.
5. Keep the project compiling and functioning.

### Database-driven forms

Many forms in this project depend on values retrieved from the database.

When modifying selects, dropdowns, autocomplete fields, filters, or lists:

- determine whether the values currently come from the database;
- inspect the API request used by the frontend;
- inspect the corresponding Express route;
- inspect the corresponding controller;
- inspect the SQL query;
- preserve database-driven behavior.

Do not convert database-driven fields into hardcoded arrays unless explicitly requested.

When a list is not displaying values, investigate the complete data flow before changing the UI.