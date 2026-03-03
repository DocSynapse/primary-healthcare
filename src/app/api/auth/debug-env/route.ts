import { NextResponse } from "next/server";

// DEBUG ONLY — hapus setelah login fix
export async function GET() {
  const raw = process.env.CREW_ACCESS_USERS_JSON ?? "";
  const secret = process.env.CREW_ACCESS_SECRET ?? "";

  let parseResult: string;
  try {
    const parsed = JSON.parse(raw);
    parseResult = `OK — ${Array.isArray(parsed) ? parsed.length : "bukan array"} entries`;
  } catch (e) {
    parseResult = `PARSE ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }

  return NextResponse.json({
    hasJson: !!raw,
    jsonLength: raw.length,
    jsonFirst30: raw.slice(0, 30),
    jsonLast10: raw.slice(-10),
    parseResult,
    hasSecret: !!secret,
    secretLength: secret.length,
  });
}
