# Server Guide

**Puskesmas Intelligence Dashboard -- Server Operation and Troubleshooting**

Architect & Built by Claudesy

---

## Starting the Development Server

```bash
npm install
npm run dev
```

Default URL: `http://localhost:7000`

This command runs `tsx server.ts`, which boots a custom HTTP server with Socket.IO integration alongside Next.js. All real-time features (team chat, EMR progress, Audrey voice) require this custom server.

If the development lock file causes issues, use the clean start variant:

```bash
npm run dev:clean
```

---

## Running Next.js Without the Custom Server

```bash
npm run dev:next
```

Use this mode only when debugging standard Next.js behavior (routing, page rendering, API routes). Features that depend on Socket.IO (chat, voice consultation, EMR progress tracking) will not function in this mode.

---

## Building and Starting for Production

```bash
npm run build
npm run start
```

The production server runs `NODE_ENV=production tsx server.ts`. Ensure all required environment variables are configured before starting.

---

## Environment Configuration

The dashboard reads configuration from `.env.local` for local development and from platform environment variables (Railway) for production.

### Required Variables

| Variable | Purpose |
|---|---|
| `CREW_ACCESS_SECRET` | HMAC signing secret for session tokens (mandatory in production) |
| `GEMINI_API_KEY` | Google Gemini API key for Audrey and CDSS |

### Optional Variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `7000` | Server listen port |
| `CREW_ACCESS_USERS_JSON` | -- | JSON array of user credentials |
| `CREW_ACCESS_USERS_FILE` | `runtime/crew-access-users.json` | Path to credential file |
| `LB1_PROJECT_ROOT` | -- | Root path for LB1 data files |
| `LB1_HISTORY_FILE` | -- | Path to LB1 execution history |
| `RME_BASE_URL` | -- | ePuskesmas base URL for RPA |
| `RME_USERNAME` / `RME_PASSWORD` | -- | ePuskesmas login credentials |
| `EMR_HEADLESS` | `true` | Run Playwright in headless mode |
| `PERPLEXITY_API_KEY` | -- | Perplexity AI integration key |

**Important**: Never commit `.env.local` or any file containing credentials to the repository.

---

## Health Check Procedure

Perform the following checks to verify the server is operating correctly:

1. **Server Response** -- Navigate to the configured URL. The page should load without network errors.
2. **Crew Portal Login** -- The login screen should appear. Authenticate with valid crew credentials.
3. **Dashboard Access** -- After authentication, the main dashboard should render with the sidebar navigation.
4. **API Verification** -- Test a sample API endpoint:
   ```bash
   curl http://localhost:7000/api/auth/session
   ```
   This should return a `401` response if no session cookie is present, confirming the auth layer is active.
5. **Socket.IO** -- Open the browser developer console. A successful Socket.IO connection is indicated by the absence of WebSocket connection errors.

---

## Troubleshooting

### Port Conflict

**Symptom**: Server fails to start with `EADDRINUSE` error.

**Resolution**: The server automatically attempts to bind to `PORT + 1` if the configured port is in use. To explicitly set a different port:

```bash
PORT=8000 npm run dev
```

Alternatively, identify and terminate the process occupying the port:

```bash
lsof -i :7000
kill <PID>
```

### Crew Login Failure

**Symptom**: Valid credentials are rejected at the login screen.

**Resolution**:
1. Verify credential source. Check `CREW_ACCESS_USERS_JSON` environment variable first, then `runtime/crew-access-users.json`.
2. If using the environment variable on Railway, be aware that the platform may escape JSON strings. The auth module attempts three parsing strategies to handle this.
3. Clear browser session storage and cookies, then retry.
4. Check server logs for `[crew-access]` prefixed messages that indicate parsing failures.

### LB1 Endpoint Errors

**Symptom**: Report generation API returns server errors.

**Resolution**:
1. Verify `LB1_PROJECT_ROOT` points to a valid directory containing export files.
2. Ensure export Excel files are not locked by another application (e.g., Excel with the file open).
3. Check that the LB1 template file exists at the configured `LB1_TEMPLATE_PATH`.
4. Review server logs for `[LB1]` prefixed error messages with detailed failure context.

### Socket.IO Connection Failure

**Symptom**: Real-time features (chat, voice, EMR progress) do not function.

**Resolution**:
1. Confirm you are running the custom server (`npm run dev`), not the standard Next.js server (`npm run dev:next`).
2. Check that no reverse proxy or firewall is blocking WebSocket upgrade requests.
3. Verify the browser console for Socket.IO connection errors.

### Audrey Voice Not Responding

**Symptom**: Voice session starts but no audio response is received.

**Resolution**:
1. Verify `GEMINI_API_KEY` is set and valid.
2. Check server logs for `[Audrey]` or `[ABBY]` prefixed messages.
3. Ensure the browser has microphone permission granted.
4. Verify the Audio Worklet file (`public/pcm-processor.js`) is accessible.

---

## Deployment on Railway

The application is deployed to Railway using the configuration in `railway.toml`:

```toml
[build]
builder = "nixpacks"
buildCommand = "npm run build"

[deploy]
startCommand = "npm run start"
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

### Deployment Checklist

1. Set all required environment variables in the Railway dashboard.
2. Ensure `NODE_ENV` is set to `production` in the production environment.
3. Push to the configured deployment branch.
4. Monitor build logs for compilation errors.
5. After deployment, verify the health check procedure above.

---

Architect & Built by Claudesy
