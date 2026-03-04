import { dataProvider, type PenyakitEntry } from './data-provider';

export interface MatcherInput {
  keluhanUtama: string;
  keluhanTambahan?: string;
  usia?: number;
  jenisKelamin?: 'L' | 'P';
}

export interface MatchedCandidate {
  diseaseId: string;
  nama: string;
  icd10: string;
  kompetensi: string;
  bodySystem: string;
  matchScore: number;
  rawMatchScore: number;
  matchedSymptoms: string[];
  totalSymptoms: number;
  redFlags: string[];
  terpiData: Array<{ obat: string; dosis: string; frek: string }>;
  kriteria_rujukan: string;
  definisi: string;
  diagnosisBanding: string[];
}

let cachedIDF: Map<string, number> | null = null;

const INDONESIAN_STOPWORDS = new Set([
  // ... (rest of the set remains same as before)
  "yang", "dan", "di", "ke", "dari", "pada", "untuk", "dengan", "adalah",
  "ini", "itu", "atau", "juga", "tidak", "ada", "akan", "bisa", "sudah",
  "telah", "sedang", "masih", "belum", "hanya", "saja", "lebih", "sangat",
  "seperti", "oleh", "karena", "sering", "dapat", "dalam", "secara",
  "antara", "tanpa", "melalui", "tentang", "setelah", "sebelum", "selama",
  "hingga", "sampai", "sejak", "mungkin", "biasanya", "kadang", "pernah",
  "dimulai", "riwayat", "pasien", "penting", "ditanyakan", "datang",
  "keluhan", "utama", "tambahan", "anamnesis", "pemeriksaan", "fisik",
  "laboratorium", "klinis", "gejala", "tanda", "disertai", "merasa",
  "hari", "minggu", "bulan", "tahun", "usia", "jenis", "kelamin",
  "laki-laki", "perempuan", "dahulu", "keluarga", "sosial", "ekonomi",
  "perjalanan", "umumnya", "khususnya", "beberapa", "macam", "terdiri",
  "atas", "lain", "adanya", "terjadi", "dialami", "mengalami", "dirasakan",
  "tampak", "terlihat", "didapatkan", "ditemukan", "berlangsung", "saat",
  "sebelumnya", "terkait", "akibat", "berhubungan", "kondisi", "medis",
  "paling", "seringkali", "biasa", "muncul", "timbul", "menunjukkan",
  "penyakit", "merupakan", "salah", "satu", "berupa", "maupun",
  "diagnosis", "terapi", "tatalaksana", "edukasi", "prognosis", "kriteria",
  "rujukan", "komplikasi", "faktor", "risiko", "definisi", "etiologi",
  "patofisiologi", "manifestasi", "pemeriksaan", "penunjang", "pengobatan",
  "diberikan", "dilakukan", "diperlukan", "disarankan", "direkomendasikan",
  "segera", "waspada", "perlu", "harus", "dapat", "mungkin", "sering",
  "jarang", "kadang-kadang", "umum", "khusus", "utama", "tambahan",
  "awal", "akhir", "akut", "kronis", "ringan", "sedang", "berat"
]);

function tokenize(text: string): string[] {
  // NEW: Normalize text using dataProvider synonyms first
  const normalized = dataProvider.normalizeText(text);
  
  const words = normalized
    .replace(/[^a-z0-9\u00C0-\u024F\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !INDONESIAN_STOPWORDS.has(t));

  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.push(`~~${words[i]}_${words[i + 1]}`);
  }
  return [...words, ...bigrams];
}

function buildIDF(diseases: PenyakitEntry[]): Map<string, number> {
  if (cachedIDF) return cachedIDF;
  const docFreq = new Map<string, number>();
  const N = diseases.length;
  for (const p of diseases) {
    const tokens = new Set(p.gejala_klinis.flatMap(g => tokenize(g)));
    for (const t of tokens) docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
  }
  cachedIDF = new Map<string, number>();
  for (const [token, df] of docFreq) {
    cachedIDF.set(token, Math.log((N + 1) / (df + 1)) + 1);
  }
  return cachedIDF;
}

function scoreDisease(
  inputTokens: Set<string>,
  disease: PenyakitEntry,
  idf: Map<string, number>,
): { combined: number; matched: string[] } {
  const symptomTokens = new Set(disease.gejala_klinis.flatMap(g => tokenize(g)));
  const definitionTokens = new Set(tokenize(disease.definisi || ''));
  const diseaseTokens = new Set([...symptomTokens, ...definitionTokens]);
  
  if (diseaseTokens.size === 0) return { combined: 0, matched: [] };

  const intersection = new Set([...inputTokens].filter(t => diseaseTokens.has(t)));
  if (intersection.size === 0) return { combined: 0, matched: [] };

  const matched = [...intersection].filter(t => !t.startsWith('~~'));

  let inputWeight = 0;
  let matchWeight = 0;
  for (const t of inputTokens) inputWeight += idf.get(t) ?? 1;
  for (const t of intersection) matchWeight += idf.get(t) ?? 1;
  const idfScore = inputWeight > 0 ? matchWeight / inputWeight : 0;

  const inputCoverage = intersection.size / Math.max(1, inputTokens.size);
  const diseaseCoverage = intersection.size / Math.max(1, diseaseTokens.size);
  const coverageScore = inputCoverage + diseaseCoverage > 0
    ? (2 * inputCoverage * diseaseCoverage) / (inputCoverage + diseaseCoverage)
    : 0;

  const union = new Set([...inputTokens, ...diseaseTokens]);
  const jaccardScore = intersection.size / union.size;

  const combined = idfScore * 0.6 + coverageScore * 0.2 + jaccardScore * 0.2;
  return { combined: Math.min(1, combined), matched };
}

export async function matchSymptoms(input: MatcherInput, topN = 10): Promise<MatchedCandidate[]> {
  if (!dataProvider.isReady()) await dataProvider.initialize();
  
  const diseases = dataProvider.getDiseases();
  const idf = buildIDF(diseases);

  const text = `${input.keluhanUtama} ${input.keluhanTambahan ?? ''}`;
  const inputTokens = new Set(tokenize(text));
  if (inputTokens.size === 0) return [];

  const candidates: MatchedCandidate[] = [];
  for (const p of diseases) {
    const { combined, matched } = scoreDisease(inputTokens, p, idf);
    if (combined < 0.05) continue;
    candidates.push({
      diseaseId: p.id,
      nama: p.nama,
      icd10: p.icd10,
      kompetensi: p.kompetensi,
      bodySystem: p.body_system,
      matchScore: combined,
      rawMatchScore: combined,
      matchedSymptoms: matched,
      totalSymptoms: p.gejala_klinis.length,
      redFlags: p.red_flags ?? [],
      terpiData: p.terapi ?? [],
      kriteria_rujukan: p.kriteria_rujukan ?? '',
      definisi: p.definisi ?? '',
      diagnosisBanding: p.diagnosis_banding ?? [],
    });
  }

  candidates.sort((a, b) => b.matchScore - a.matchScore);
  return candidates.slice(0, topN);
}

export async function getKBDiseaseCount(): Promise<number> {
  if (!dataProvider.isReady()) await dataProvider.initialize();
  return dataProvider.getDiseases().length;
}

export function clearMatcherCache(): void {
  cachedIDF = null;
}



