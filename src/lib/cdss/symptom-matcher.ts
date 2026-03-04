import { dataProvider, type PenyakitEntry } from './data-provider';
import type { VitalSigns } from './types';

export interface MatcherInput {
  keluhanUtama: string;
  keluhanTambahan?: string;
  usia?: number;
  jenisKelamin?: 'L' | 'P';
  vitalSigns?: VitalSigns;
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
  negatedSymptoms: string[];
  totalSymptoms: number;
  redFlags: string[];
  terpiData: Array<{ obat: string; dosis: string; frek: string }>;
  kriteria_rujukan: string;
  definisi: string;
  diagnosisBanding: string[];
  clinicalReasoning?: string;
}

interface ClinicalLR {
  lrPos: number; 
  lrNeg: number;
  isMandatory?: boolean; 
  ageGroup?: 'pediatric' | 'adult' | 'geriatric';
}

const CLINICAL_PHRASES = [
  "benjolan payudara",
  "jeruk busuk",
  "kulit jeruk",
  "peau d orange",
  "nyeri goyang porsio",
  "terlambat haid",
  "benjolan tidak bisa masuk",
  "sesak saat berbaring",
  "orthopnea",
  "bengkak kedua tungkai",
  "tidak bisa bab",
  "tidak bisa kentut",
  "perut membesar",
  "obstipasi",
  "minum minuman keras",
  "alkohol",
  "muntah darah",
  "hematemesis",
  "nyeri perut kanan bawah",
  "nyeri berpindah",
  "nyeri tekan mcburney",
  "anorexia",
  "tidak mau makan",
  "muntah setelah nyeri",
  "perut papan",
  "defans muskular",
  "kaki bengkak sebelah",
  "kehilangan kesadaran",
  "penurunan kesadaran",
  "sesak napas",
  "nyeri dada tipikal",
  "anak masih aktif",
  "masih mau main",
  "kaku kuduk",
  "petechiae",
  "sela jari"
];

/**
 * ISKANDAR V3.2 - MULTI-LAYER LIKELIHOOD MAP (DOCTOR ISKANDAR'S BRAIN)
 */
const DOCTORS_LR_MAP: Record<string, ClinicalLR | ClinicalLR[]> = {
  // --- ONCOLOGY ---
  "benjolan payudara": { lrPos: 10.0, lrNeg: 0.1 },
  "jeruk busuk": { lrPos: 60.0, lrNeg: 0.8 }, // Pathognomonic for late-stage CA Mammae
  "kulit jeruk": { lrPos: 50.0, lrNeg: 0.8 },
  "peau d orange": { lrPos: 55.0, lrNeg: 0.8 },

  // --- CANCER SENTINEL (B-SYMPTOMS & PHYSICAL) ---
  "berat badan turun drastis": { lrPos: 12.0, lrNeg: 0.5 },
  "benjolan keras": { lrPos: 15.0, lrNeg: 0.2 },
  "tidak bisa digerakkan": { lrPos: 20.0, lrNeg: 0.1 },
  "terfiksir": { lrPos: 20.0, lrNeg: 0.1 },
  "luka tidak sembuh": { lrPos: 10.0, lrNeg: 0.3 },
  "benjolan makin besar": { lrPos: 5.0, lrNeg: 0.5 },
  "anemia kronis": { lrPos: 4.0, lrNeg: 0.7 },

  // --- OBGYN EMERGENCY ---
  "nyeri goyang porsio": { lrPos: 45.0, lrNeg: 0.01, isMandatory: true }, 
  "terlambat haid": { lrPos: 5.0, lrNeg: 0.1 },

  // --- SURGICAL EMERGENCY ---
  "benjolan tidak bisa masuk": { lrPos: 40.0, lrNeg: 0.01, isMandatory: true }, 
  "nyeri tekan mcburney": { lrPos: 15.0, lrNeg: 0.1 },
  "defans muskular": { lrPos: 25.0, lrNeg: 0.5 },
  "perut papan": { lrPos: 25.0, lrNeg: 0.5 },
  "tidak bisa bab": { lrPos: 15.0, lrNeg: 0.1 },
  "tidak bisa kentut": { lrPos: 40.0, lrNeg: 0.05, isMandatory: true },
  "perut membesar": { lrPos: 10.0, lrNeg: 0.2 },
  "muntah setelah nyeri": { lrPos: 3.5, lrNeg: 0.5 },

  // --- GENERAL SYMPTOMS ---
  "anorexia": { lrPos: 1.3, lrNeg: 0.3 },
  "tidak mau makan": { lrPos: 1.3, lrNeg: 0.3 },

  // --- INTERNAL MEDICINE ---
  "sesak saat berbaring": { lrPos: 12.0, lrNeg: 0.3 }, 
  "orthopnea": { lrPos: 15.0, lrNeg: 0.2 },
  "bengkak kedua tungkai": { lrPos: 8.0, lrNeg: 0.2 },
  "minum minuman keras": { lrPos: 35.0, lrNeg: 0.1 },
  "muntah darah": { lrPos: 25.0, lrNeg: 0.1 },

  // --- RESILIENCE (DR. ISKANDAR'S PHILOSOPHY) ---
  "anak masih aktif": { lrPos: 0.2, lrNeg: 3.0, ageGroup: 'pediatric' },
  "masih mau main": { lrPos: 0.15, lrNeg: 4.0, ageGroup: 'pediatric' },
  
  // --- MANDATORY SYMPTOMS ---
  "nyeri perut": { lrPos: 2.0, lrNeg: 0.01, isMandatory: true }, 
  "demam": { lrPos: 1.5, lrNeg: 0.05, isMandatory: false }, 
  "batuk": { lrPos: 1.5, lrNeg: 0.01, isMandatory: true, ageGroup: 'adult' }, 
  
  // --- PATHOGNOMONIC ---
  "nyeri berpindah": { lrPos: 20.0, lrNeg: 0.2 },
  "nyeri dada tipikal": { lrPos: 12.0, lrNeg: 0.1 },
  "kaku kuduk": { lrPos: 30.0, lrNeg: 0.01, isMandatory: true },
  "bicara pelo": { lrPos: 25.0, lrNeg: 0.1 },
  "petechiae": { lrPos: 18.0, lrNeg: 0.8 },
  "sela jari": { lrPos: 15.0, lrNeg: 0.2 },
};

const SEASONAL_BOOST: Record<string, number> = {
  "A91": 3.0, "A90": 2.5, "A09": 1.5, "A27": 4.0
};

function isRainySeason(): boolean {
  const month = new Date().getMonth() + 1;
  return month >= 11 || month <= 4;
}

function probToOdds(p: number): number { return p / (1 - p); }
function oddsToProb(o: number): number { return o / (1 + o); }

function extractClinicalEvidence(text: string): { positive: Set<string>, negative: Set<string> } {
  const normalized = text.toLowerCase();
  const positive = new Set<string>();
  const negative = new Set<string>();
  const NEGATION_WORDS = ["tidak", "bukan", "tanpa", "negatif", "menyangkal", "tdk", "normal", "tdk ada"];

  for (const phrase of CLINICAL_PHRASES) {
    if (normalized.includes(phrase)) {
      const idx = normalized.indexOf(phrase);
      const precedingText = normalized.substring(Math.max(0, idx - 25), idx);
      const isNegated = NEGATION_WORDS.some(neg => precedingText.includes(neg));
      if (isNegated) negative.add(phrase);
      else positive.add(phrase);
    }
  }
  
  for (const key of Object.keys(DOCTORS_LR_MAP)) {
    if (!CLINICAL_PHRASES.includes(key) && normalized.includes(key)) {
      const idx = normalized.indexOf(key);
      const precedingText = normalized.substring(Math.max(0, idx - 20), idx);
      if (NEGATION_WORDS.some(neg => precedingText.includes(neg))) negative.add(key);
      else positive.add(key);
    }
  }
  return { positive, negative };
}

function calculateV32Score(
  evidence: { positive: Set<string>, negative: Set<string> },
  disease: PenyakitEntry,
  input: MatcherInput
): { score: number, matched: string[], negated: string[], reasoning: string } {
  const epi = dataProvider.getEpiWeight(disease.icd10);
  let basePrevalence = epi ? epi.prevalence_pct : 0.1;
  if (isRainySeason() && SEASONAL_BOOST[disease.icd10]) basePrevalence *= SEASONAL_BOOST[disease.icd10];

  let currentOdds = probToOdds(Math.min(0.5, basePrevalence / 100));
  const matched: string[] = [];
  const negated: string[] = [];
  let lrChain = "";
  let mandatoryKilled = false;

  const diseaseSymptoms = disease.gejala_klinis.map(g => g.toLowerCase());
  const patientAge = input.usia || 30;
  const ageGroup = patientAge < 12 ? 'pediatric' : patientAge > 60 ? 'geriatric' : 'adult';

  for (const symptom of diseaseSymptoms) {
    const evidenceKey = Array.from(evidence.positive).find(p => symptom.includes(p) || p.includes(symptom)) ||
                        Array.from(evidence.negative).find(n => symptom.includes(n) || n.includes(symptom));
    
    const lrKey = evidenceKey && DOCTORS_LR_MAP[evidenceKey] ? evidenceKey : 
                  (DOCTORS_LR_MAP[symptom] ? symptom : null);

    if (!lrKey) continue;

    const rawLr = DOCTORS_LR_MAP[lrKey];
    const lrs = Array.isArray(rawLr) ? rawLr : [rawLr];
    const lrData = lrs.find(l => !l.ageGroup || l.ageGroup === ageGroup) || lrs[0];

    const isPresent = evidence.positive.has(lrKey) || Array.from(evidence.positive).some(p => lrKey.includes(p));
    const isAbsent = evidence.negative.has(lrKey) || Array.from(evidence.negative).some(n => lrKey.includes(n));

    if (isPresent) {
      currentOdds *= lrData.lrPos;
      matched.push(lrKey);
      lrChain += `+${lrData.lrPos} `;
    } else if (isAbsent) {
      currentOdds *= lrData.lrNeg;
      negated.push(lrKey);
      lrChain += `-${lrData.lrNeg} `;
      if (lrData.isMandatory) mandatoryKilled = true;
    }
  }

  if (input.vitalSigns) {
    const v = input.vitalSigns;
    if (v.temperature && v.temperature >= 38.5) {
      const needsFever = diseaseSymptoms.some(s => s.includes('demam') || s.includes('panas'));
      currentOdds *= needsFever ? 2.5 : 0.4;
    }
    if (v.systolic && v.systolic < 90) {
      const isEmergency = disease.red_flags?.some(rf => rf.toLowerCase().includes('syok') || rf.toLowerCase().includes('rujuk'));
      currentOdds *= isEmergency ? 5.0 : 0.5;
    }
  }

  let finalProb = oddsToProb(currentOdds);
  if (mandatoryKilled) finalProb = Math.min(finalProb, 0.01);

  return {
    score: Math.min(0.99, finalProb),
    matched,
    negated,
    reasoning: `Base: ${basePrevalence.toFixed(2)}%, LRs: ${lrChain.trim()}, Killed: ${mandatoryKilled}`
  };
}

export async function matchSymptoms(input: MatcherInput, topN = 10): Promise<MatchedCandidate[]> {
  if (!dataProvider.isReady()) await dataProvider.initialize();
  const diseases = dataProvider.getDiseases();
  const text = `${input.keluhanUtama} ${input.keluhanTambahan ?? ''}`;
  const evidence = extractClinicalEvidence(text);
  const candidates: MatchedCandidate[] = [];

  for (const p of diseases) {
    const { score, matched, negated, reasoning } = calculateV32Score(evidence, p, input);
    if (score < 0.01 && matched.length === 0) continue;
    candidates.push({
      diseaseId: p.id, nama: p.nama, icd10: p.icd10, kompetensi: p.kompetensi, bodySystem: p.body_system,
      matchScore: score, rawMatchScore: score, matchedSymptoms: matched, negatedSymptoms: negated,
      totalSymptoms: p.gejala_klinis.length, redFlags: p.red_flags ?? [], terpiData: p.terapi ?? [],
      kriteria_rujukan: p.kriteria_rujukan ?? '', definisi: p.definisi ?? '',
      diagnosisBanding: p.diagnosis_banding ?? [], clinicalReasoning: reasoning
    });
  }
  return candidates.sort((a, b) => b.matchScore - a.matchScore).slice(0, topN);
}

export async function getKBDiseaseCount(): Promise<number> {
  if (!dataProvider.isReady()) await dataProvider.initialize();
  return dataProvider.getDiseases().length;
}
