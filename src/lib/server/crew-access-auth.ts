import "server-only";

import fs from "node:fs";
import path from "node:path";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  CREW_ACCESS_COOKIE_NAME,
  CREW_ACCESS_SESSION_TTL_SECONDS,
  type CrewAccessSession,
  type CrewAccessUser,
} from "@/lib/crew-access";
import { CREW_USERS } from "@/lib/server/crew-access-users";

interface CrewAccessCredential extends CrewAccessUser {
  password: string;
}

interface SessionPayloadV1 {
  v: 1;
  username: string;
  displayName: string;
  issuedAt: number;
  expiresAt: number;
}

let cachedSecret: string | null = null;
let cachedUsers: CrewAccessCredential[] | null = null;
let cachedUsersMtimeMs = -1;

function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

function getUsersFilePath(): string {
  return process.env.CREW_ACCESS_USERS_FILE?.trim()
    || path.join(process.cwd(), "runtime", "crew-access-users.json");
}

function parseUsersFromJson(raw: string): CrewAccessCredential[] {
  const parsed = JSON.parse(raw) as Array<{
    username?: unknown;
    password?: unknown;
    displayName?: unknown;
  }>;

  if (!Array.isArray(parsed)) return [];

  const users: CrewAccessCredential[] = [];
  for (const item of parsed) {
    const username = String(item.username ?? "").trim();
    const password = String(item.password ?? "").trim();
    const displayName = String(item.displayName ?? "").trim();
    if (!username || !password || !displayName) continue;
    users.push({
      username: normalizeUsername(username),
      password,
      displayName,
    });
  }

  return users;
}

function tryParseUsersJson(raw: string): CrewAccessCredential[] {
  // Pass 1: parse langsung
  const parsed = JSON.parse(raw);
  // Pass 2: Railway kadang wrap array dalam string — double-parse
  if (typeof parsed === "string") return parseUsersFromJson(parsed);
  return parseUsersFromJson(raw);
}

function loadUsersFromEnv(): CrewAccessCredential[] {
  const json = process.env.CREW_ACCESS_USERS_JSON?.trim() ?? "";
  if (!json) return [];

  // Attempt 1: parse as-is
  try {
    return tryParseUsersJson(json);
  } catch (err1) {
    console.error("[crew-access] Parse attempt 1 failed:", (err1 as Error).message);
  }

  // Attempt 2: unescape \" → " (Railway kadang escape quotes)
  try {
    const unescaped = json.replace(/\\"/g, '"');
    const result = tryParseUsersJson(unescaped);
    console.log("[crew-access] Parse berhasil setelah unescape. Users:", result.length);
    return result;
  } catch (err2) {
    console.error("[crew-access] Parse attempt 2 (unescape) failed:", (err2 as Error).message);
  }

  // Attempt 3: strip outer quotes jika Railway wrap dengan "..."
  try {
    const stripped = json.replace(/^["']|["']$/g, "");
    const result = tryParseUsersJson(stripped);
    console.log("[crew-access] Parse berhasil setelah strip outer quotes. Users:", result.length);
    return result;
  } catch (err3) {
    console.error("[crew-access] Parse attempt 3 (strip quotes) failed:", (err3 as Error).message);
    console.error("[crew-access] Raw JSON (60 char pertama):", json.slice(0, 60));
    return [];
  }
}

function loadUsersFromFile(): CrewAccessCredential[] {
  const filePath = getUsersFilePath();
  if (!fs.existsSync(filePath)) return [];

  const stat = fs.statSync(filePath);
  if (cachedUsers && cachedUsersMtimeMs === stat.mtimeMs) {
    return cachedUsers;
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const users = parseUsersFromJson(content);
  cachedUsers = users;
  cachedUsersMtimeMs = stat.mtimeMs;
  return users;
}

function getCrewAccessUsers(): CrewAccessCredential[] {
  const envUsers = loadUsersFromEnv();
  if (envUsers.length > 0) return envUsers;
  const fileUsers = loadUsersFromFile();
  if (fileUsers.length > 0) return fileUsers;
  // Fallback: gunakan users yang di-compile ke dalam kode
  return CREW_USERS;
}

function getSecret(): string {
  if (cachedSecret) return cachedSecret;

  const envSecret = process.env.CREW_ACCESS_SECRET?.trim();
  if (envSecret) {
    cachedSecret = envSecret;
    return envSecret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("CREW_ACCESS_SECRET belum diatur untuk production.");
  }

  cachedSecret = randomBytes(48).toString("hex");
  return cachedSecret;
}

function createSignature(payloadBase64: string): string {
  return createHmac("sha256", getSecret())
    .update(payloadBase64)
    .digest("base64url");
}

function parseCookie(cookieHeader: string, cookieName: string): string | null {
  const pairs = cookieHeader.split(";").map((p) => p.trim());
  for (const pair of pairs) {
    if (!pair) continue;
    const eqIdx = pair.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = pair.slice(0, eqIdx).trim();
    const value = pair.slice(eqIdx + 1).trim();
    if (key === cookieName) return value;
  }
  return null;
}

function toSession(payload: SessionPayloadV1): CrewAccessSession {
  return {
    username: payload.username,
    displayName: payload.displayName,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
  };
}

export function validateCrewAccess(username: string, password: string): CrewAccessUser | null {
  const normalizedUsername = normalizeUsername(username);
  const users = getCrewAccessUsers();
  const found = users.find((u) => u.username === normalizedUsername);
  if (!found) return null;
  if (found.password !== password) return null;
  return { username: found.username, displayName: found.displayName };
}

export function createCrewSession(user: CrewAccessUser): {
  token: string;
  session: CrewAccessSession;
} {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload: SessionPayloadV1 = {
    v: 1,
    username: normalizeUsername(user.username),
    displayName: user.displayName,
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + CREW_ACCESS_SESSION_TTL_SECONDS,
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
  const signature = createSignature(payloadBase64);
  return {
    token: `${payloadBase64}.${signature}`,
    session: toSession(payload),
  };
}

export function getCrewSessionFromRequest(request: Request): CrewAccessSession | null {
  try {
    const cookieHeader = request.headers.get("cookie") ?? "";
    const token = parseCookie(cookieHeader, CREW_ACCESS_COOKIE_NAME);
    if (!token) return null;

    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [payloadBase64, signature] = parts;
    const expectedSignature = createSignature(payloadBase64);
    const actualSigBuffer = Buffer.from(signature, "utf-8");
    const expectedSigBuffer = Buffer.from(expectedSignature, "utf-8");

    if (actualSigBuffer.length !== expectedSigBuffer.length) return null;
    if (!timingSafeEqual(actualSigBuffer, expectedSigBuffer)) return null;

    const payload = JSON.parse(
      Buffer.from(payloadBase64, "base64url").toString("utf-8"),
    ) as SessionPayloadV1;

    if (payload.v !== 1) return null;
    if (!payload.username || !payload.displayName) return null;
    if (!Number.isInteger(payload.issuedAt) || !Number.isInteger(payload.expiresAt)) return null;
    if (payload.expiresAt <= Math.floor(Date.now() / 1000)) return null;

    return toSession(payload);
  } catch {
    return null;
  }
}

function safeTokenEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf-8");
  const rightBuffer = Buffer.from(right, "utf-8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function getAutomationTokenFromRequest(request: Request): string {
  const tokenFromHeader = request.headers.get("x-crew-access-token")?.trim() ?? "";
  if (tokenFromHeader) return tokenFromHeader;

  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (/^bearer\s+/i.test(authorization)) {
    return authorization.replace(/^bearer\s+/i, "").trim();
  }
  return "";
}

export function isCrewAuthorizedRequest(_request: Request): boolean {
  // AUTH DISABLED SEMENTARA — aktifkan kembali setelah login fix
  return true;
}

export function getSessionCookieOptions() {
  return {
    name: CREW_ACCESS_COOKIE_NAME,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CREW_ACCESS_SESSION_TTL_SECONDS,
  };
}

export function getCrewAccessConfigStatus(): { ok: boolean; message: string } {
  try {
    const hasEnvJson = !!(process.env.CREW_ACCESS_USERS_JSON?.trim());
    const hasEnvSecret = !!(process.env.CREW_ACCESS_SECRET?.trim());
    console.log("[crew-access] Config check — CREW_ACCESS_USERS_JSON ada:", hasEnvJson, "| CREW_ACCESS_SECRET ada:", hasEnvSecret);

    const users = getCrewAccessUsers();
    console.log("[crew-access] Users loaded:", users.length);

    if (users.length === 0) {
      return {
        ok: false,
        message: "Konfigurasi crew access belum ada. Isi CREW_ACCESS_USERS_JSON atau runtime/crew-access-users.json.",
      };
    }
    getSecret();
    return { ok: true, message: "" };
  } catch (error) {
    console.error("[crew-access] Config status error:", error);
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Konfigurasi auth tidak valid.",
    };
  }
}
