# CLAUDE.md

**AI Assistant Conventions for Puskesmas Intelligence Dashboard**

Architect & Built by Claudesy

---

## Project Summary

This is a Next.js 16.1 (App Router) clinical operations dashboard for Puskesmas Balowerti, Kediri. It integrates EMR automation (Playwright RPA), LB1 report generation, ICD-10 lookup, real-time team chat (Socket.IO), clinical decision support (Gemini AI), and voice consultation (Gemini Live).

## Critical Commands

```bash
# Development
npm run dev          # Start custom server (server.ts) with Socket.IO on port 7000
npm run dev:next     # Start standard Next.js dev server (no Socket.IO)
npm run dev:clean    # Clear dev lock file, then start custom server

# Production
npm run build        # Build Next.js production bundle
npm run start        # Start production server via custom server

# No test suite is currently configured.
```

## Architecture Rules

### Server
- The application uses a **custom HTTP server** (`server.ts`) that wraps Next.js with Socket.IO. Do not replace this with the default Next.js server.
- Socket.IO and Next.js share the same port (default `7000`).
- The Socket.IO instance is injected into the EMR module via `setSocketIO()` from `src/lib/emr/socket-bridge.ts`.

### File Organization
- **Pages**: `src/app/[route]/page.tsx` (all are `"use client"`)
- **API Routes**: `src/app/api/[domain]/route.ts`
- **Shared Libraries**: `src/lib/[module]/`
- **Components**: `src/components/`
- **Static Data**: `public/data/` (ICD-10, diseases, drugs) and `database/` (raw reference files)
- **Runtime Config**: `runtime/` directory (gitignored, not committed)

### Path Alias
- `@/*` maps to `./src/*` (configured in `tsconfig.json`)

### TypeScript
- Strict mode is enabled.
- Types are co-located in `types.ts` within each module directory.
- The `@typescript-eslint` rules may be suppressed inline when necessary, always with a justifying comment.
- Several CDSS modules are excluded from compilation in `tsconfig.json` -- do not re-include them without instruction.

## Code Conventions

### Naming
- Components: PascalCase filenames (`AppNav.tsx`, `CrewAccessGate.tsx`)
- Library modules: kebab-case filenames (`crew-access.ts`, `dynamic-db.ts`)
- API routes: `route.ts` in descriptive directory paths
- CSS variables: `--kebab-case` (e.g., `--bg-canvas`, `--text-main`)

### Styling
- The project uses **vanilla CSS with custom properties** (no Tailwind, no CSS-in-JS).
- Theme is toggled via `data-theme` attribute on `<html>` (`"dark"` or `"light"`).
- Colors must reference CSS variables from `globals.css`.
- Inline styles are the dominant pattern for component-specific layout.
- Fonts: Geist Sans (`var(--font-geist-sans)`) and Geist Mono (`var(--font-geist-mono)`).
- Primary accent: `#E67E22` (gold).

### Server-Only Modules
- Any module that accesses the file system, credentials, or Node.js-only APIs must include `import "server-only"` at the top.
- Authentication logic lives in `src/lib/server/` and must never be imported from client components.

### API Routes
- Return JSON via `NextResponse.json({ ok: true/false, ... })`.
- Add `export const runtime = "nodejs"` for routes requiring Node.js APIs.
- Log errors with a module prefix: `[LB1]`, `[EMR]`, `[CDSS]`, `[Auth]`.

### Authentication
- All pages are wrapped by `CrewAccessGate` in the root layout -- no per-page auth checks needed.
- Session tokens are HMAC-SHA256 signed cookies with 12-hour TTL.
- User credentials are sourced from: env var > file > compiled defaults.
- Cookie name: `puskesmas_crew_session`.

## Key Modules and Their Locations

| Module | Location | Description |
|---|---|---|
| Custom Server | `server.ts` | HTTP + Socket.IO + Gemini Live relay |
| Auth | `src/lib/server/crew-access-auth.ts` | Session management, HMAC signing |
| Auth Types | `src/lib/crew-access.ts` | Shared types and constants |
| LB1 Engine | `src/lib/lb1/engine.ts` | Report pipeline orchestrator |
| LB1 Config | `src/lib/lb1/config.ts` | Path resolution, YAML loading |
| EMR Engine | `src/lib/emr/transfer-orchestrator.ts` | Playwright auto-fill orchestrator |
| EMR Handlers | `src/lib/emr/handlers/` | anamnesa, diagnosa, resep handlers |
| ICD Database | `src/lib/icd/dynamic-db.ts` | Multi-version ICD-10 lookup |
| Navigation | `src/components/AppNav.tsx` | Sidebar with collapsible menu |
| Theme | `src/components/ThemeProvider.tsx` | Dark/light theme context |
| CDSS API | `src/app/api/cdss/diagnose/route.ts` | Clinical decision support |
| Global CSS | `src/app/globals.css` | Theme variables, base styles |

## Environment Variables

### Required for Production
- `CREW_ACCESS_SECRET` -- HMAC signing secret (server throws if missing in production)
- `GEMINI_API_KEY` -- Google Gemini API key

### Optional
- `PORT` -- Server port (default: `7000`)
- `CREW_ACCESS_USERS_JSON` -- JSON array of user credentials
- `CREW_ACCESS_USERS_FILE` -- Path to credential file
- `LB1_PROJECT_ROOT`, `LB1_OUTPUT_DIR`, `LB1_TEMPLATE_PATH`, `LB1_MAPPING_PATH`
- `RME_BASE_URL`, `RME_USERNAME`, `RME_PASSWORD`, `EMR_HEADLESS`
- `PERPLEXITY_API_KEY`

## Things to Avoid

1. **Do not introduce Tailwind CSS or any CSS framework.** The project uses vanilla CSS with custom properties by design.
2. **Do not introduce a global state management library** (Redux, Zustand, etc.). Use React Context and local state.
3. **Do not replace the custom server** with the default Next.js dev server for features that require Socket.IO.
4. **Do not commit credentials or API keys.** Use `.env.local` or the `runtime/` directory.
5. **Do not re-include excluded CDSS modules** in `tsconfig.json` without explicit instruction.
6. **Do not modify the HMAC session signing mechanism** without a security review.
7. **Do not use `reactStrictMode: true`** -- it is intentionally disabled due to custom socket handling in `server.ts`.

## Commit Convention

```
<type>(<scope>): <description>
```

Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `perf`, `debug`

Scopes: `auth`, `emr`, `lb1`, `cdss`, `voice`, `acars`, `icdx`, `report`, `nav`, `theme`

## Deployment

- Platform: Railway (Nixpacks, Node.js 20)
- Build: `npm run build`
- Start: `npm run start` (runs `NODE_ENV=production tsx server.ts`)
- Restart policy: on failure, max 3 retries

---

Architect & Built by Claudesy
