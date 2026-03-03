# Changelog

**Puskesmas Intelligence Dashboard -- Version History**

Architect & Built by Claudesy

All notable changes to this project are documented in this file. This project follows [Semantic Versioning](https://semver.org/).

---

## [1.0.0] -- 2026-02-28

### Initial Release -- Puskesmas Intelligence Dashboard v1.0

**Core Platform**
- Next.js 16.1 application with App Router and TypeScript strict mode.
- Custom HTTP server integrating Socket.IO for real-time capabilities.
- Crew Access Portal with HMAC-SHA256 signed session authentication.
- Dark/light theme system with warm clinical design language (Geist fonts, gold accent).
- Collapsible sidebar navigation with keyboard shortcut support (Ctrl+B).

**User Profile Dashboard**
- Crew member profile display with session-based identity.
- Quick-link grid to government health portals (Satu Sehat, SIPARWA, ePuskesmas, P-Care BPJS).
- Patient data overview with vitals, ICD-X coding, and treatment history.

**EMR Auto-Fill Engine**
- Playwright-driven RPA engine for ePuskesmas form automation.
- Three-step transfer pipeline: anamnesis, diagnosis, prescription.
- Real-time progress reporting via Socket.IO.
- Configurable retry logic and timeout per step.

**LB1 Report Automation**
- End-to-end pipeline: discover, parse, normalize, map, aggregate, write.
- Excel template output for national LB1 format.
- REGIS format output with separate referral sheet.
- QC CSV export for rejected records.
- JSON summary with statistics and unmapped diagnosis tracking.
- Optional RPA export from ePuskesmas when no local file is available.

**ICD-X Finder**
- Multi-version ICD-10 lookup (2010, 2016, 2019 catalogs).
- Dynamic search with fuzzy matching.
- Cross-version code translation and legacy code support.
- Indonesia-specific extension catalog.

**Audrey -- Clinical Consultation AI**
- Real-time voice consultation via Google Gemini Live (native audio).
- WebSocket relay architecture for audio streaming.
- Automatic voice activity detection with configurable silence threshold.
- Push-to-talk mode support.
- Clinical system prompt calibrated for Puskesmas-level resources.

**ACARS -- Internal Chat**
- Socket.IO-backed team messaging.
- Room-based conversations with typing indicators.
- Online presence tracking.

**CDSS -- Clinical Decision Support**
- Hybrid diagnostic suggestion engine (local database + Gemini reasoning).
- Disease knowledge base: 159 diseases, 45,030 real encounter records.
- Ranked differential diagnoses with red flag indicators.
- Traffic light classification (GREEN/YELLOW/RED).

**Deployment**
- Railway deployment configuration with Nixpacks (Node.js 20).
- Automatic restart on failure (max 3 retries).

---

## [1.0.1] -- 2026-03-01

### Authentication Hardening

- Added robust 3-attempt JSON parsing for `CREW_ACCESS_USERS_JSON` environment variable to handle Railway platform escaping behavior.
- Added try/catch with unescape fallback for credential parsing.
- Added temporary debug endpoint (`/api/auth/debug-env`) for Railway environment variable inspection.
- Fixed authentication fallback to compiled user list when environment and file sources fail.

---

## [1.0.2] -- 2026-03-02

### Voice Engine Refinements

- Audrey clinical response style updated: concise answers by default, detailed elaboration only when explicitly requested.
- Reverted push-to-talk to always-on VAD mode for live presentation use case.
- Implemented correct Gemini Live activity signals for PTT mode.

---

Architect & Built by Claudesy
