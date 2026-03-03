# Contributing

**Puskesmas Intelligence Dashboard -- Development Guidelines**

Architect & Built by Claudesy

---

## Table of Contents

1. [Development Environment](#development-environment)
2. [Branch Strategy](#branch-strategy)
3. [Code Conventions](#code-conventions)
4. [Component Patterns](#component-patterns)
5. [API Route Conventions](#api-route-conventions)
6. [Styling Guidelines](#styling-guidelines)
7. [Commit Messages](#commit-messages)
8. [Pull Request Process](#pull-request-process)
9. [Security Considerations](#security-considerations)

---

## Development Environment

### Prerequisites

- Node.js >= 20.9.0
- npm (included with Node.js)
- Git

### Initial Setup

```bash
git clone <repository-url>
cd healthcare-dashboard
npm install
cp .env.example .env.local  # Configure environment variables
npm run dev
```

The development server starts at `http://localhost:7000` using the custom server (`server.ts`) which provides Socket.IO integration alongside Next.js.

### Editor Configuration

This project uses TypeScript in strict mode. Configure your editor to respect the `tsconfig.json` settings. The path alias `@/*` maps to `./src/*`.

---

## Branch Strategy

| Branch | Purpose |
|---|---|
| `master` | Production-ready code. Deploys to Railway. |
| `claude/*` | Feature branches created during AI-assisted development sessions. |
| `feature/*` | Manual feature branches. |
| `fix/*` | Bug fix branches. |

All changes should be developed on feature branches and merged into `master` via pull request after review.

---

## Code Conventions

### TypeScript

- **Strict mode** is enforced (`"strict": true` in `tsconfig.json`).
- Use explicit type annotations for function parameters and return types on exported functions.
- Prefer `interface` over `type` for object shapes that may be extended.
- Use `type` for unions, intersections, and utility types.
- Avoid `any`. Use `unknown` when the type is genuinely uncertain, and narrow with type guards.
- Suppress `@typescript-eslint` rules inline only with a comment explaining the rationale.

### File Naming

- **Pages**: `page.tsx` (Next.js App Router convention)
- **API Routes**: `route.ts` (Next.js App Router convention)
- **Components**: PascalCase (e.g., `AppNav.tsx`, `CrewAccessGate.tsx`)
- **Libraries**: kebab-case (e.g., `crew-access.ts`, `dynamic-db.ts`)
- **Types**: Co-located in a `types.ts` file within the relevant module directory

### Imports

- Use the `@/` path alias for all imports from `src/`.
- Group imports in the following order, separated by blank lines:
  1. External packages (`next`, `react`, third-party)
  2. Internal modules (`@/lib/...`, `@/components/...`)
  3. Types (using `import type`)
  4. Relative imports (same module)

### Server-Only Code

- Use `import "server-only"` at the top of any module that must never be bundled for the client. This applies to authentication logic, file system operations, and credential handling.

---

## Component Patterns

### Client vs. Server Components

- **Client Components** (`"use client"` directive): Used for interactive pages, event handlers, hooks, and browser APIs. All pages in this project are client components.
- **Server Components**: Used for the root layout and metadata. API routes run on the server by default.

### State Management

- Use React `useState` and `useRef` for local component state.
- Use React Context for cross-cutting concerns (see `ThemeProvider`).
- Do **not** introduce global state management libraries without discussing the need first.

### Authentication Guard

All authenticated pages are wrapped by `CrewAccessGate` in the root layout. If adding a new page that should require authentication, no additional work is needed -- the gate applies automatically.

If a page should be publicly accessible (e.g., a health check), it must be implemented as an API route that bypasses the session check.

---

## API Route Conventions

### Structure

API routes live in `src/app/api/` and follow the Next.js App Router file convention (`route.ts`).

### Response Format

Return JSON responses using `NextResponse.json()`:

```typescript
// Success
return NextResponse.json({ ok: true, data: result });

// Error
return NextResponse.json({ ok: false, error: "Description" }, { status: 400 });
```

### Runtime Declaration

For routes that require Node.js APIs (file system, child processes, Playwright), add the runtime declaration:

```typescript
export const runtime = "nodejs";
```

### Error Handling

- Wrap handler bodies in try/catch.
- Return structured error responses with appropriate HTTP status codes.
- Log errors to the console with a descriptive prefix (e.g., `[LB1]`, `[EMR]`, `[CDSS]`).

---

## Styling Guidelines

### Theme System

The application uses CSS custom properties for theming, toggled via the `data-theme` attribute on the `<html>` element. All color values should reference CSS variables defined in `globals.css`.

| Variable | Purpose |
|---|---|
| `--bg-canvas` | Main background |
| `--bg-nav` | Sidebar background |
| `--text-main` | Primary text color |
| `--text-muted` | Secondary text color |
| `--line-base` | Border color |
| `--c-asesmen` | Primary accent (gold) |
| `--c-critical` | Error/danger (red) |
| `--c-warning` | Warning (orange) |

### Design Tokens

The primary accent color is `#E67E22` (gold). The design language follows a warm, clinical aesthetic:
- Dark theme: dark backgrounds with cream text
- Light theme: cream backgrounds with dark brown text

### Inline Styles

This project uses inline styles extensively for dynamic and component-specific styling. When adding new styles:
- Use CSS variables for colors and fonts.
- Use the Geist font family: `var(--font-geist-sans)` for body text, `var(--font-geist-mono)` for monospace.
- Keep layout properties (flexbox, grid) inline when they are specific to a single component.

### No External CSS Framework

Do **not** introduce Tailwind CSS, styled-components, or similar frameworks. The project uses vanilla CSS with custom properties by design.

---

## Commit Messages

Follow the conventional commit format:

```
<type>(<scope>): <description>

[optional body]
```

### Types

| Type | Usage |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code restructuring without behavior change |
| `docs` | Documentation only |
| `chore` | Maintenance (dependencies, config) |
| `perf` | Performance improvement |
| `debug` | Temporary debug code (should be removed before merge) |

### Scopes

Use the module name as scope: `auth`, `emr`, `lb1`, `cdss`, `voice`, `acars`, `icdx`, `report`, `nav`, `theme`.

### Examples

```
feat(voice): implement push-to-talk mode with Gemini Live activity signals
fix(auth): robust 3-attempt JSON parse for Railway env variable
docs: add ARCHITECTURE.md with system component map
```

---

## Pull Request Process

1. Create a feature branch from `master`.
2. Make changes following the conventions above.
3. Verify the build succeeds: `npm run build`.
4. Write a clear PR description that includes:
   - What was changed and why.
   - How to test the change.
   - Any environment variable additions.
5. Request review.
6. Squash-merge into `master` when approved.

---

## Security Considerations

- **Never commit credentials** to the repository. Use environment variables or `runtime/` directory files (which are gitignored).
- **Never expose API keys** in client-side code. All AI API calls must be proxied through server-side API routes.
- Use the `"server-only"` import guard on modules containing sensitive logic.
- Session tokens use HMAC-SHA256 signing. Do not modify the signing mechanism without a security review.
- The `CREW_ACCESS_SECRET` environment variable is mandatory in production. The server will throw an error if it is not set.

---

Architect & Built by Claudesy
