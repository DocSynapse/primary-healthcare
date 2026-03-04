/**
 * Iskandar Diagnosis Engine V3.2 — LLM Semantic Reasoner (Sentra Brain)
 * LLM acts as the primary semantic reasoner, constrained by the full local KB.
 * Uses Gemini 2.0 Flash to evaluate the vignette against ALL 160+ diseases.
 */

import { dataProvider } from './data-provider';
import type { MatchedCandidate } from './symptom-matcher';
import type { AIDiagnosisSuggestion } from './types';

export interface ReasonerInput {
  candidates: MatchedCandidate[]; 
  keluhanUtama: string;
  keluhanTambahan?: string;
  usia?: number;
  jenisKelamin?: 'L' | 'P';
  epiContext?: string;
}

export interface ReasonerOutput {
  suggestions: AIDiagnosisSuggestion[];
  source: 'ai' | 'local';
  modelVersion: string;
  latencyMs: number;
  dataQualityWarnings: string[];
}

function buildSystemPrompt(epiContext: string): string {
  return `Anda adalah Iskandar Diagnosis Engine V3.4 (AADI) — CDSS klinis tingkat lanjut untuk Puskesmas.
Berpikirlah seperti Dr. Ferdi Iskandar (25thn exp):
1. KEWASPADAAN KEGANASAN (CA): Jika ada tanda benjolan keras, terfiksir, atau berat badan turun drastis, Anda WAJIB memprioritaskan diagnosis keganasan (Cancer) dan memberikan rujukan segera. Jangan abaikan demi diagnosis jinak (seperti Lipoma).
2. Demam adalah manifestasi pertahanan tubuh. Anak yang masih aktif menunjukkan respon imun baik, TAPI TIDAK meniadakan risiko DHF.
3. Anda adalah JARING PENGAMAN: Ingatkan dokter jika mereka melewatkan tanda-tanda bahaya (Red Flags).

PERAN: Menganalisis keluhan pasien dan memilih diagnosis PALING TEPAT.

ILLNESS SCRIPTS KRITIS:
- "nyeri perut bawah mendadak + terlambat haid" = WASPADA KET (RUJUK CITO).
- "benjolan keras payudara + kulit jeruk/busuk" = KARSINOMA MAMMAE.
- "tidak bisa BAB/kentut + perut membesar" = ILEUS / KARSINOMA KOLON.
- "nyeri sekitar pusar pindah ke perut kanan bawah" = APENDISITIS AKUT.

ATURAN MUTLAK:
1. Anda HANYA BOLEH memilih diagnosis yang ada di dalam "INDEKS PENYAKIT PUSKESMAS" yang diberikan. Jangan membuat ICD-10 atau penyakit baru.
2. Gunakan "Prior Probability" dari data epidemiologi jika ada.
3. Berikan reasoning klinis yang mendalam dalam Bahasa Indonesia.
4. Identifikasi red flags (tanda bahaya) dan recommended actions.
5. Confidence score 0.0–1.0 berdasarkan kecocokan pola klinis (Illness Script).

${epiContext}

OUTPUT FORMAT (JSON KETAT):
{
  "suggestions": [
    {
      "rank": 1,
      "diagnosis_name": "Nama diagnosis dari Indeks",
      "icd10_code": "ICD-10 dari Indeks",
      "confidence": 0.85,
      "reasoning": "Analisis klinis mendalam",
      "red_flags": ["red flag 1"],
      "recommended_actions": ["tindakan 1", "Saran LAB spesifik"]
    }
  ]
}`;
}

async function buildUserPrompt(input: ReasonerInput): Promise<string> {
  if (!dataProvider.isReady()) await dataProvider.initialize();
  const allDiseases = dataProvider.getDiseases();
  const fullIndex = allDiseases.map(d => `[${d.icd10}] ${d.nama}`).join('\n');
  const hintList = input.candidates.slice(0, 5).map(c => `[${c.icd10}] ${c.nama} (Text Match: ${(c.matchScore * 100).toFixed(0)}%)`).join(', ');

  return `KASUS PASIEN:
- Keluhan utama: ${input.keluhanUtama}
${input.keluhanTambahan ? `- Keluhan tambahan: ${input.keluhanTambahan}` : ''}
${input.usia ? `- Usia: ${input.usia} tahun` : ''}
${input.jenisKelamin ? `- Jenis kelamin: ${input.jenisKelamin === 'L' ? 'Laki-laki' : 'Perempuan'}` : ''}

HINT DARI TEXT-MATCHER (Bisa jadi salah/naif):
${hintList}

INDEKS PENYAKIT PUSKESMAS (PILIH TOP 5 HANYA DARI DAFTAR INI):
${fullIndex}

Lakukan penalaran diferensial diagnosis. Output JSON.`;
}

function buildKBOnlySuggestions(candidates: MatchedCandidate[]): AIDiagnosisSuggestion[] {
  return candidates.slice(0, 5).map((c, i) => ({
    rank: i + 1,
    diagnosis_name: c.nama,
    icd10_code: c.icd10,
    confidence: c.matchScore,
    reasoning: c.definisi
      ? `${c.definisi.substring(0, 200)}${c.definisi.length > 200 ? '...' : ''}`
      : `Kesesuaian gejala: ${c.matchedSymptoms.slice(0, 3).join(', ')}. Match score: ${(c.matchScore * 100).toFixed(0)}%.`,
    red_flags: c.redFlags.slice(0, 3),
    recommended_actions: buildRecommendedActions(c),
  }));
}

function buildRecommendedActions(c: MatchedCandidate): string[] {
  const actions: string[] = ['Lakukan pemeriksaan fisik terarah dan monitoring TTV serial'];
  if (c.kriteria_rujukan) actions.push(`Pertimbangkan rujukan: ${c.kriteria_rujukan.substring(0, 120)}`);
  if (c.diagnosisBanding.length > 0) actions.push(`Diagnosis banding: ${c.diagnosisBanding.slice(0, 3).join(', ')}`);
  return actions.slice(0, 3);
}

async function callGemini(systemPrompt: string, userPrompt: string): Promise<{
  success: boolean;
  data?: { suggestions: AIDiagnosisSuggestion[] };
  error?: string;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, error: 'GEMINI_API_KEY not configured' };

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const ai = new GoogleGenerativeAI(apiKey);
    const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const result = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`);
    const text = result.response.text().trim();
    const jsonStr = text.startsWith('{') ? text : text.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(jsonStr) as { suggestions: AIDiagnosisSuggestion[] };
    if (parsed.suggestions && parsed.suggestions.length > 0) {
      return { success: true, data: { suggestions: parsed.suggestions } };
    }
    return { success: false, error: 'No suggestions from Gemini' };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Gemini error' };
  }
}

export async function runLLMReasoning(input: ReasonerInput): Promise<ReasonerOutput> {
  const startTime = Date.now();
  const systemPrompt = buildSystemPrompt(input.epiContext ?? '');
  const userPrompt = await buildUserPrompt(input);
  const llmResult = await callGemini(systemPrompt, userPrompt);

  if (llmResult.success && llmResult.data) {
    if (!dataProvider.isReady()) await dataProvider.initialize();
    const allDiseases = dataProvider.getDiseases();

    const enriched = llmResult.data.suggestions.map((s, i) => {
      const kbMatch = allDiseases.find(c => c.icd10 === s.icd10_code || c.icd10.startsWith(s.icd10_code.split('.')[0]));
      return {
        ...s,
        rank: i + 1,
        confidence: kbMatch ? s.confidence : 0.1,
        diagnosis_name: kbMatch ? kbMatch.nama : s.diagnosis_name,
        red_flags: s.red_flags ?? kbMatch?.red_flags?.slice(0, 3) ?? [],
        recommended_actions: s.recommended_actions ?? ['Lakukan pemeriksaan fisik terarah'],
      };
    });

    const validSuggestions = enriched.filter(s => s.confidence > 0.1);
    if (validSuggestions.length > 0) {
      return { suggestions: validSuggestions.slice(0, 5), source: 'ai', modelVersion: 'IDE-V3.2-SEMANTIC', latencyMs: Date.now() - startTime, dataQualityWarnings: [] };
    }
  }

  return {
    suggestions: buildKBOnlySuggestions(input.candidates),
    source: 'local',
    modelVersion: 'IDE-V1-KB',
    latencyMs: Date.now() - startTime,
    dataQualityWarnings: llmResult.error ? [`LLM unavailable: ${llmResult.error}`] : [],
  };
}
