# Architecture

**Puskesmas Intelligence Dashboard -- System Design Document**

Architect & Built by Claudesy

---

## Table of Contents

1. [System Overview](#system-overview)
2. [High-Level Architecture](#high-level-architecture)
3. [Server Architecture](#server-architecture)
4. [Application Layer](#application-layer)
5. [Module Deep Dives](#module-deep-dives)
6. [Data Flow Diagrams](#data-flow-diagrams)
7. [External Integrations](#external-integrations)
8. [Security Architecture](#security-architecture)
9. [Deployment Architecture](#deployment-architecture)

---

## System Overview

The Puskesmas Intelligence Dashboard is a monolithic Next.js application augmented with a custom HTTP server layer for Socket.IO real-time capabilities. It operates as an internal clinical operations portal, connecting multiple healthcare subsystems through a unified interface.

### Design Principles

1. **Single Deployment Unit** -- All services (web UI, API, Socket.IO, RPA engine) run in one process.
2. **No External Database** -- Stateless design. Data originates from external systems (ePuskesmas, Gemini API) and local JSON/Excel files. Runtime state is held in memory.
3. **RPA-First Integration** -- Legacy healthcare systems without APIs are accessed via Playwright browser automation.
4. **AI-Augmented Clinical Workflow** -- Diagnostic intelligence and voice consultation are integrated at the point of care, not as separate tools.

---

## High-Level Architecture

```
+---------------------------------------------------------------------+
|                          Client (Browser)                           |
|  +----------+  +--------+  +-------+  +------+  +------+  +------+ |
|  | Dashboard |  |  EMR   |  | ICD-X |  | LB1  |  |Audrey|  | ACARS| |
|  |   Home    |  | Panel  |  |Finder |  |Report|  |Voice |  | Chat | |
|  +-----+-----  +---+----+  +--+----+  +--+---+  +--+---+  +--+---+ |
|        |            |          |          |          |          |     |
+--------|------------|----------|----------|----------|----------|-----+
         |            |          |          |          |          |
    HTTP |       HTTP |     HTTP |     HTTP |   WS/IO  |   WS/IO  |
         |            |          |          |          |          |
+--------|------------|----------|----------|----------|----------|-----+
|        v            v          v          v          v          v     |
|  +--------------------------------------------------------------------+
|  |                    Custom HTTP Server (server.ts)                  |
|  |  +-------------------+         +-------------------------------+  |
|  |  | Next.js App Router|         |     Socket.IO Server          |  |
|  |  | (HTTP handling)   |         | - Chat rooms & presence       |  |
|  |  +--------+----------+         | - EMR progress events         |  |
|  |           |                    | - Gemini Live audio relay     |  |
|  |           v                    +-------------------------------+  |
|  |  +--------------------------------------------------------------------+
|  |  |                         API Routes                                 |
|  |  |  /api/auth/*   /api/cdss/*   /api/emr/*   /api/report/*          |
|  |  |  /api/icdx/*   /api/voice/*  /api/news/*  /api/perplexity/*      |
|  |  +--------------------------------------------------------------------+
|  |           |                |                |                         |
|  |           v                v                v                         |
|  |  +---------------+  +------------+  +----------------+               |
|  |  | Auth Module   |  | LB1 Engine |  | EMR Engine     |               |
|  |  | (HMAC tokens) |  | (pipeline) |  | (Playwright)   |               |
|  |  +---------------+  +------------+  +----------------+               |
|  +--------------------------------------------------------------------+  |
+----------------------------------------------------------------------+
         |                |                |
         v                v                v
  +-----------+    +------------+    +-----------+
  | JSON Data |    | Excel/CSV  |    | External  |
  | (ICD-10,  |    | (exports,  |    | Services  |
  |  diseases)|    |  templates)|    | (Gemini,  |
  +-----------+    +------------+    | ePuskesmas|
                                     +-----------+
```

---

## Server Architecture

### Custom Server (`server.ts`)

The application does not use the default Next.js server. Instead, it boots a custom `http.createServer` that:

1. Creates an HTTP server.
2. Attaches the Next.js request handler to it.
3. Attaches a Socket.IO server to the same HTTP server.
4. Injects the Socket.IO instance into the EMR module via `setSocketIO()`.

This architecture allows Socket.IO and Next.js to share the same port, simplifying deployment.

### Socket.IO Namespaces

All Socket.IO events operate on the default namespace (`/`):

| Event | Direction | Purpose |
|---|---|---|
| `user:join` | Client -> Server | Register user presence |
| `users:online` | Server -> Client | Broadcast online user list |
| `room:join` | Client -> Server | Join a chat room |
| `message:send` | Client -> Server | Send message to room |
| `message:receive` | Server -> Client | Deliver message to room members |
| `typing:start/stop` | Bidirectional | Typing indicators |
| `voice:start` | Client -> Server | Initialize Gemini Live session |
| `voice:audio_chunk` | Client -> Server | Stream microphone PCM data |
| `voice:audio` | Server -> Client | Stream Gemini audio response |
| `voice:text` | Server -> Client | Stream Gemini text transcript |
| `voice:turn_complete` | Server -> Client | Gemini finished speaking |
| `voice:end_turn` | Client -> Server | User finished speaking (PTT) |
| `voice:stop` | Client -> Server | Terminate voice session |
| `emr:progress` | Server -> Client | EMR auto-fill progress events |

### Port Configuration

Default port is `7000` (not `3000`). If the port is in use, the server automatically tries the next port (`PORT + 1`). Port can be overridden via the `PORT` environment variable.

---

## Application Layer

### Root Layout (`src/app/layout.tsx`)

The component hierarchy wraps every page:

```
<html>
  <body>
    <ThemeProvider>                    // Dark/light theme context
      <CrewAccessGate>                // Authentication guard
        <div class="app-shell">
          <AppNav />                  // Sidebar navigation
          <main class="app-content">
            {children}                // Page content
          </main>
        </div>
      </CrewAccessGate>
    </ThemeProvider>
  </body>
</html>
```

### Navigation Map

| Route | Page Component | Module |
|---|---|---|
| `/` | `src/app/page.tsx` | User profile, quick links, patient vitals |
| `/emr` | `src/app/emr/page.tsx` | EMR auto-fill interface |
| `/icdx` | `src/app/icdx/page.tsx` | ICD-10 code lookup |
| `/report` | `src/app/report/page.tsx` | LB1 report dashboard |
| `/voice` | `src/app/voice/page.tsx` | Audrey clinical consultation |
| `/acars` | `src/app/acars/page.tsx` | Real-time team chat |
| `/chat` | `src/app/chat/page.tsx` | Contact-based messaging |
| `/pasien` | `src/app/pasien/page.tsx` | Patient records |

---

## Module Deep Dives

### 1. Authentication Module

**Location**: `src/lib/server/crew-access-auth.ts`, `src/lib/crew-access.ts`

**Mechanism**: Custom HMAC-SHA256 signed session tokens stored in HTTP-only cookies.

```
Login Flow:
  1. Client POSTs credentials to /api/auth/login
  2. Server validates against user list (env > file > compiled)
  3. Server creates signed token: base64url(payload).hmac-sha256(payload)
  4. Token set as HTTP-only cookie (puskesmas_crew_session)
  5. Session TTL: 12 hours

Validation Flow:
  1. Request arrives at any page
  2. CrewAccessGate fetches /api/auth/session
  3. Server extracts cookie, verifies HMAC signature
  4. Checks expiration timestamp
  5. Returns session data or 401
```

**User Source Priority**:
1. `CREW_ACCESS_USERS_JSON` environment variable
2. `runtime/crew-access-users.json` file
3. Compiled defaults in `src/lib/server/crew-access-users.ts`

### 2. LB1 Report Engine

**Location**: `src/lib/lb1/`

**Purpose**: Automate generation of the Indonesian Ministry of Health LB1 (Laporan Bulanan 1) report from ePuskesmas visit export data.

```
Pipeline Stages:
  1. DISCOVER   -- Scan data source directory for export files
  2. RPA EXPORT -- (Optional) Trigger Playwright to export from ePuskesmas
  3. PARSE      -- Read Excel/CSV, extract encounter rows
  4. NORMALIZE  -- Validate dates, sex codes, ICD codes; filter invalid
  5. MAP        -- Translate diagnosis codes using mapping file
  6. AGGREGATE  -- Group by ICD category, age bucket, sex, visit type
  7. WRITE      -- Generate LB1 Excel from template + QC CSV + summary JSON
```

**Key Files**:
- `engine.ts` -- Pipeline orchestrator
- `config.ts` -- Path resolution and YAML config loading
- `io.ts` -- Excel/CSV parsing
- `transform.ts` -- Record normalization and aggregation
- `template-writer.ts` -- Excel output generation
- `icd-mapping.ts` -- ICD-10 code mapping
- `rme-export.ts` -- Playwright RPA for ePuskesmas export
- `types.ts` -- Type definitions

### 3. EMR Auto-Fill Engine

**Location**: `src/lib/emr/`

**Purpose**: Transfer structured clinical data (anamnesis, diagnosis, prescription) into ePuskesmas web forms via Playwright browser automation.

```
Transfer Flow:
  1. Client submits patient encounter data to /api/emr/transfer/run
  2. Transfer Orchestrator manages step execution order
  3. Each handler (anamnesa, diagnosa, resep) drives Playwright
  4. Progress events broadcast via Socket.IO to the client
  5. Results returned with per-step success/failure details
```

**Handler Pipeline**: `anamnesa` -> `diagnosa` -> `resep`

Each handler:
- Opens or navigates to the correct ePuskesmas form section
- Maps internal field names to DOM selectors (see `field-mappings.ts`, `field-selectors.ts`)
- Fills form fields using Playwright page interactions
- Reports success count, failure count, and latency

### 4. Audrey -- Voice Consultation AI

**Location**: `server.ts` (server-side), `src/app/voice/page.tsx` (client-side)

**Architecture**: WebSocket relay between browser microphone and Google Gemini Live API.

```
Audio Pipeline:
  Browser Mic (16kHz PCM)
      |
      v
  AudioWorklet (pcm-processor.js)
      |
      v  base64-encoded chunks
  Socket.IO client
      |
      v  voice:audio_chunk
  Socket.IO server
      |
      v  sendRealtimeInput()
  Gemini Live API (gemini-2.5-flash-native-audio)
      |
      v  audio response chunks
  Socket.IO server
      |
      v  voice:audio
  Browser (Web Audio API, 24kHz playback)
```

**Voice Activity Detection**: Gemini's built-in automatic activity detection with configurable silence duration (500ms) and prefix padding (20ms).

### 5. CDSS -- Clinical Decision Support

**Location**: `src/app/api/cdss/diagnose/route.ts`

**Approach**: Hybrid algorithm combining local disease database matching with Gemini LLM reasoning.

1. Load disease knowledge base (`public/data/penyakit.json`) containing 159 diseases with symptoms, physical examination findings, and treatments.
2. Score candidate diagnoses using IDF + Coverage + Jaccard similarity against presented symptoms.
3. Augment with Gemini-generated clinical reasoning for the top candidates.
4. Return ranked suggestions with red flag indicators and traffic light classification.

### 6. ICD-X Dynamic Database

**Location**: `src/lib/icd/dynamic-db.ts`

Supports three ICD-10 versions (2010, 2016, 2019) loaded from JSON and XML sources in the `database/` directory. Provides:
- Code-to-description lookup
- Full-text search across all versions
- Cross-version code translation
- Extension catalog for Indonesia-specific codes

---

## Data Flow Diagrams

### LB1 Report Generation

```
ePuskesmas (Web)
      |
      | Playwright RPA export
      v
  Excel File (data source dir)
      |
      | parseExportFile()
      v
  Raw EncounterRow[]
      |
      | normalizeRecords()
      v
  valid[] + invalid[]
      |
      | aggregateForLb1()
      v
  AggregatedData
      |
      +---> writeLb1Output()     --> LB1_YYYY_MM.xlsx
      +---> writeRegisLb1Output() --> REGIS_YYYY_MM.xlsx
      +---> writeFile()           --> QC_YYYY_MM.csv
      +---> writeFile()           --> SUMMARY_YYYY_MM.json
```

### Authentication

```
Browser                    Server
  |                          |
  |-- POST /api/auth/login ->|
  |   {username, password}   |
  |                          |-- validateCrewAccess()
  |                          |-- createCrewSession()
  |                          |
  |<- Set-Cookie: token ----|
  |<- {ok: true}           -|
  |                          |
  |-- GET /api/auth/session->|
  |   Cookie: token          |
  |                          |-- getCrewSessionFromRequest()
  |                          |-- verify HMAC + expiry
  |<- {user: {...}}        --|
```

---

## External Integrations

| Service | Protocol | Purpose |
|---|---|---|
| Google Gemini API | HTTPS | CDSS diagnostic reasoning, TTS |
| Google Gemini Live | WebSocket (via SDK) | Audrey real-time voice consultation |
| ePuskesmas | Playwright (HTTP/Browser) | EMR form filling, visit data export |
| Perplexity API | HTTPS | AI-powered medical research |

---

## Security Architecture

### Authentication Layer

- HMAC-SHA256 signed session tokens (not JWT -- custom format).
- HTTP-only, SameSite=Lax cookies prevent XSS token theft.
- Timing-safe comparison for signature verification prevents timing attacks.
- 12-hour session TTL with server-side expiration check.

### Server-Side Isolation

- Credential handling modules import `"server-only"` to prevent accidental client bundling.
- All AI API keys are accessed server-side only and proxied through API routes.
- RPA credentials for ePuskesmas are environment-variable only.

### Current Limitations

- Passwords are compared in plaintext (no bcrypt/argon2 hashing).
- API route authorization is currently disabled (`isCrewAuthorizedRequest` returns `true`).
- CORS is open (`origin: "*"`) on the Socket.IO server.

These are acknowledged technical debt items for the current internal-use deployment.

---

## Deployment Architecture

### Railway

```
railway.toml
  |
  +-- Build: nixpacks (Node.js 20)
  |     npm run build  (next build)
  |
  +-- Deploy: npm run start
  |     NODE_ENV=production tsx server.ts
  |
  +-- Restart: on_failure (max 3 retries)
```

### Environment Variable Categories

| Category | Variables |
|---|---|
| Server | `PORT`, `NODE_ENV` |
| Authentication | `CREW_ACCESS_SECRET`, `CREW_ACCESS_USERS_JSON`, `CREW_ACCESS_USERS_FILE` |
| Google AI | `GEMINI_API_KEY` |
| EMR/RPA | `RME_BASE_URL`, `RME_USERNAME`, `RME_PASSWORD`, `EMR_HEADLESS` |
| LB1 Engine | `LB1_PROJECT_ROOT`, `LB1_OUTPUT_DIR`, `LB1_TEMPLATE_PATH`, `LB1_MAPPING_PATH`, `LB1_HISTORY_FILE` |
| Optional AI | `PERPLEXITY_API_KEY` |

### Runtime Directory

The `runtime/` directory (gitignored) stores:
- `crew-access-users.json` -- Credential file fallback
- `rme-session.json` -- Playwright browser session persistence
- `lb1-config.yaml` -- LB1 engine configuration
- Generated reports and temporary files

---

Architect & Built by Claudesy
