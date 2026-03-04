import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { isCrewAuthorizedRequest } from "@/lib/server/crew-access-auth";
import { dataProvider } from "@/lib/cdss/data-provider";

export const runtime = "nodejs";

// ─── Load knowledge base (cached per process) ────────────────────────────────

let _systemPrompt: string | null = null;

async function buildSystemPrompt(): Promise<string> {
  if (_systemPrompt) return _systemPrompt;

  if (!dataProvider.isReady()) await dataProvider.initialize();

  // Load 144 penyakit KKI from unified dataProvider
  const diseases = dataProvider.getDiseases();
  const diseaseContext = diseases
    .slice(0, 144)
    .map((d) => `- ${d.nama} (ICD: ${d.icd10}): ${d.definisi.substring(0, 150)}...`)
    .join("\n");

  // Load common ICD-10 from diseases list (subset for context window)
  const icdContext = diseases
    .slice(0, 200)
    .map((d) => `${d.icd10}: ${d.nama}`)
    .join("\n");

  _systemPrompt = `Kamu adalah ABBY (Advanced Biomedical Bridging Intelligence) — asisten klinis AI untuk dr. Ferdi Iskandar di Puskesmas Balowerti, Kota Kediri, Indonesia.

Kamu dibangun di atas engine AETHER (Advanced Engineering Transformer for Hyper-Efficient Reasoning) dari Sentra Healthcare Solutions.

## Identitas & Karakter
- Presisi, objektif, dan analitis — seperti seorang konsultan medis senior
- Bahasa Indonesia yang jelas dan klinis, tidak bertele-tele
- Sadar konteks FKTP/Puskesmas: keterbatasan alat, formularium nasional, sistem BPJS
- Familiar dengan 144 diagnosis kompetensi dokter umum KKI dan Panduan Praktik Klinis IDI

## Cara Menjawab
- **Diferensial diagnosis**: urutkan dari paling probable → less probable, sertakan red flags
- **Tata laksana**: prioritaskan yang tersedia di Puskesmas dan formularium nasional
- **ICD-10**: berikan kode paling tepat, sertakan nama lengkapnya
- **Rujukan**: sebutkan indikasi rujukan secara eksplisit jika diperlukan
- **Format**: singkat, terstruktur, langsung ke inti — dokter sedang sibuk memeriksa pasien
- Jika pertanyaan di luar kompetensi dokter umum → arahkan ke spesialis yang tepat

## Batasan Kritis
- JANGAN fabrikasi diagnosis atau kode ICD-10 yang tidak ada
- JANGAN berikan saran terapi tanpa konteks diagnosis yang jelas
- SELALU dukung otonomi klinis dokter — kamu adalah alat bantu, bukan pengambil keputusan
- Jika data klinis tidak cukup → minta informasi tambahan yang spesifik

## Database 144 Penyakit Kompetensi Dokter Umum (KKI)
${diseaseContext}

## Referensi ICD-10 BPJS e-Klaim (subset umum)
${icdContext}`;

  return _systemPrompt;
}

// ─── Chat history per session (in-memory, simple) ────────────────────────────

interface ChatMessage {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

const sessions = new Map<string, ChatMessage[]>();

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  if (!isCrewAuthorizedRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "GEMINI_API_KEY belum dikonfigurasi di .env.local" }, { status: 500 });
  }

  const body = await request.json().catch(() => ({})) as {
    message?: string;
    sessionId?: string;
    reset?: boolean;
  };

  const { message, sessionId = "default", reset = false } = body;

  if (reset) {
    sessions.delete(sessionId);
    return NextResponse.json({ ok: true, reset: true });
  }

  if (!message?.trim()) {
    return NextResponse.json({ ok: false, error: "Pesan kosong" }, { status: 400 });
  }

  // Init atau ambil history session
  if (!sessions.has(sessionId)) sessions.set(sessionId, []);
  const history = sessions.get(sessionId)!;

  try {
    const systemInstruction = await buildSystemPrompt();
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction,
    });

    const chat = model.startChat({
      history,
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.3, // rendah untuk konsistensi klinis
      },
    });

    const result = await chat.sendMessage(message);
    const responseText = result.response.text();

    // Simpan ke history
    history.push({ role: "user", parts: [{ text: message }] });
    history.push({ role: "model", parts: [{ text: responseText }] });

    // Batasi history 20 turn terakhir agar tidak overflow
    if (history.length > 40) history.splice(0, history.length - 40);

    return NextResponse.json({ ok: true, response: responseText });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: `Gemini error: ${msg}` }, { status: 500 });
  }
}
