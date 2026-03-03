# Security Policy

**Puskesmas Intelligence Dashboard -- Security Policy**

Architect & Built by Claudesy

---

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, contact the development team directly through the official Sentra Healthcare Solutions communication channels. Include the following in your report:

1. A description of the vulnerability and its potential impact.
2. Steps to reproduce the issue.
3. Any relevant logs, screenshots, or proof-of-concept code.
4. Your recommended remediation, if applicable.

We will acknowledge receipt of your report within 48 hours and provide an initial assessment within 5 business days.

---

## Supported Versions

| Version | Supported |
|---|---|
| 1.0.x | Yes |
| < 1.0 | No |

---

## Security Architecture Overview

### Authentication

- Session-based authentication using HMAC-SHA256 signed tokens.
- Tokens are stored in HTTP-only, SameSite=Lax cookies to mitigate XSS and CSRF risks.
- Timing-safe comparison is used for signature verification to prevent timing attacks.
- Session TTL is 12 hours with server-side expiration enforcement.
- The `CREW_ACCESS_SECRET` environment variable is mandatory in production; the server will refuse to start without it.

### Server-Side Isolation

- Modules handling credentials and sensitive logic use the `"server-only"` import guard to prevent accidental client-side bundling.
- All external API keys (Gemini, Perplexity) are accessed exclusively through server-side API routes and are never exposed to the client.
- RPA credentials for ePuskesmas are environment-variable only and are never stored in the repository.

### Data Handling

- This system does not maintain its own database. Patient data is sourced from and written back to ePuskesmas via Playwright RPA. No patient records are permanently stored on the application server.
- Exported report files and temporary data reside in the `runtime/` directory, which is gitignored.
- Clinical data processed by the CDSS and voice consultation modules is handled in-memory and not persisted.

---

## Known Security Considerations

The following items are acknowledged for the current internal-deployment context and are tracked for future remediation:

1. **Plaintext Password Comparison** -- Crew access passwords are compared without hashing (no bcrypt/argon2). This is acceptable for the current internal-use scope but must be addressed before any external-facing deployment.

2. **API Route Authorization Bypass** -- The `isCrewAuthorizedRequest` function currently returns `true` unconditionally. Proper per-route authorization checks should be re-enabled.

3. **Open CORS on Socket.IO** -- The Socket.IO server is configured with `origin: "*"`. This should be restricted to the application's domain in production.

4. **No Rate Limiting** -- API routes do not currently implement rate limiting. This should be added for authentication endpoints at minimum.

5. **No Content Security Policy (CSP)** -- HTTP response headers do not include CSP directives. Adding a strict CSP is recommended.

---

## Credential Management

### Environment Variables (Production)

| Variable | Purpose | Required |
|---|---|---|
| `CREW_ACCESS_SECRET` | HMAC signing key for session tokens | Yes |
| `CREW_ACCESS_USERS_JSON` | JSON array of user credentials | Recommended |
| `GEMINI_API_KEY` | Google Gemini API key | Yes |
| `RME_USERNAME` / `RME_PASSWORD` | ePuskesmas RPA credentials | If using EMR features |

### Files That Must Never Be Committed

- `.env.local` -- Local environment configuration
- `runtime/crew-access-users.json` -- Credential file
- `runtime/rme-session.json` -- Browser session persistence
- Any file containing API keys, passwords, or tokens

The `.gitignore` file is configured to exclude these paths. Verify its contents before committing.

---

## Dependency Security

- Dependencies should be audited regularly using `npm audit`.
- Keep Next.js, React, and Playwright updated to receive security patches.
- The Gemini SDK (`@google/genai`, `@google/generative-ai`) should be updated when new versions address security advisories.

---

## Incident Response

In the event of a suspected security breach:

1. Rotate the `CREW_ACCESS_SECRET` environment variable immediately.
2. Rotate all API keys (`GEMINI_API_KEY`, `PERPLEXITY_API_KEY`).
3. Rotate ePuskesmas RPA credentials.
4. Review Railway deployment logs for unauthorized access.
5. Notify the Sentra Healthcare Solutions security team.

---

Architect & Built by Claudesy
