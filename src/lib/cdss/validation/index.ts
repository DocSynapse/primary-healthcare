import { dataProvider, type PenyakitEntry } from '../data-provider';
import type { AIDiagnosisSuggestion } from '../types';
import type { RedFlag } from '../red-flags';
import type { ValidationResult, ValidationContext, ValidatedSuggestion, LayerResult } from './types';

// ── Layer 1: Syntax ──────────────────────────────────────────────────────────

function validateSyntax(suggestions: unknown[]): { passed: boolean; valid: AIDiagnosisSuggestion[]; errors: string[] } {
  const valid: AIDiagnosisSuggestion[] = [];
  const errors: string[] = [];
  if (!Array.isArray(suggestions)) return { passed: false, valid: [], errors: ['Not an array'] };

  for (let i = 0; i < suggestions.length; i++) {
    const s = suggestions[i] as Record<string, unknown>;
    if (!s || typeof s !== 'object') { errors.push(`Item ${i}: not an object`); continue; }
    const missing = ['diagnosis_name', 'icd10_code', 'confidence'].filter(f => !(f in s));
    if (missing.length > 0) { errors.push(`Item ${i}: missing ${missing.join(', ')}`); continue; }
    if (typeof s.diagnosis_name !== 'string' || !s.diagnosis_name) { errors.push(`Item ${i}: invalid diagnosis_name`); continue; }
    if (typeof s.icd10_code !== 'string' || !s.icd10_code) { errors.push(`Item ${i}: invalid icd10_code`); continue; }
    if (typeof s.confidence !== 'number' || s.confidence < 0 || s.confidence > 1) { errors.push(`Item ${i}: invalid confidence`); continue; }
    valid.push({
      rank: (s.rank as number) || i + 1,
      diagnosis_name: s.diagnosis_name as string,
      icd10_code: (s.icd10_code as string).toUpperCase(),
      confidence: s.confidence as number,
      reasoning: (s.reasoning as string) || '',
      red_flags: Array.isArray(s.red_flags) ? s.red_flags as string[] : [],
      recommended_actions: Array.isArray(s.recommended_actions) ? s.recommended_actions as string[] : [],
    });
  }
  return { passed: valid.length > 0, valid, errors };
}

// ── Layer 2: Schema (ICD-10 check) ───────────────────────────────────────────

async function validateSchema(suggestions: AIDiagnosisSuggestion[]): Promise<{
  passed: boolean;
  verified: Map<string, boolean>;
  unverified: string[];
  entries: Map<string, PenyakitEntry>;
}> {
  if (!dataProvider.isReady()) await dataProvider.initialize();
  const verified = new Map<string, boolean>();
  const unverified: string[] = [];
  const entries = new Map<string, PenyakitEntry>();

  for (const s of suggestions) {
    const entry = dataProvider.getPenyakitByICD(s.icd10_code);
    if (entry) { verified.set(s.icd10_code, true); entries.set(s.icd10_code, entry); }
    else { verified.set(s.icd10_code, false); unverified.push(s.icd10_code); }
  }
  return { passed: unverified.length < suggestions.length, verified, unverified, entries };
}

// ── Layer 3: Clinical plausibility ───────────────────────────────────────────

function validateClinical(suggestions: AIDiagnosisSuggestion[], context: ValidationContext): {
  passed: boolean;
  filtered: AIDiagnosisSuggestion[];
  removed: Array<{ code: string; reason: string }>;
} {
  const filtered: AIDiagnosisSuggestion[] = [];
  const removed: Array<{ code: string; reason: string }> = [];

  for (const s of suggestions) {
    const code = s.icd10_code;
    if (context.patient_gender === 'L' && code.startsWith('O')) { removed.push({ code, reason: 'Pregnancy code for male' }); continue; }
    if (code.startsWith('P') && context.patient_age > 1) { removed.push({ code, reason: 'Neonatal code for non-infant' }); continue; }
    filtered.push(s);
  }
  return { passed: filtered.length > 0, filtered, removed };
}

// ── Layer 4: Safety integration ──────────────────────────────────────────────

function integrateSafety(
  suggestions: AIDiagnosisSuggestion[],
  redFlags: RedFlag[],
  entries: Map<string, PenyakitEntry>,
): AIDiagnosisSuggestion[] {
  const existingCodes = new Set(suggestions.map(s => s.icd10_code));

  for (const flag of redFlags) {
    // Only unshift the first code to avoid duplicates in UI if multiple codes exist for one condition
    const firstCode = flag.icd_codes[0];
    if (firstCode && !existingCodes.has(firstCode)) {
        suggestions.unshift({ 
          rank: 0, 
          diagnosis_name: flag.condition, 
          icd10_code: firstCode, 
          confidence: 0.95, 
          reasoning: `RED FLAG: ${flag.criteria_met.join(', ')}`, 
          red_flags: [flag.action], 
          recommended_actions: [flag.action] 
        });
        existingCodes.add(firstCode);
    }
  }

  for (const s of suggestions) {
    const entry = entries.get(s.icd10_code);
    if (entry) {
      if (entry.red_flags && entry.red_flags.length > 0) {
        const existing = new Set(s.red_flags ?? []);
        for (const rf of entry.red_flags) if (!existing.has(rf)) { s.red_flags = [...(s.red_flags ?? []), rf]; existing.add(rf); }
      }
      if (entry.terapi && entry.terapi.length > 0 && s.recommended_actions) {
        const terapiSummary = entry.terapi.slice(0, 3).map(t => `${t.obat} ${t.dosis} ${t.frek}`).join('; ');
        if (terapiSummary && !s.recommended_actions.some(a => a.includes(terapiSummary))) {
          s.recommended_actions.push(`Terapi PPK: ${terapiSummary}`);
        }
      }
      if (entry.kriteria_rujukan && s.recommended_actions && !s.recommended_actions.some(a => a.toLowerCase().includes('rujuk'))) {
        s.recommended_actions.push(`Kriteria Rujukan: ${entry.kriteria_rujukan}`);
      }
    }
  }
  return suggestions;
}

// ── Layer 5: Confidence filtering ────────────────────────────────────────────

function filterConfidence(suggestions: AIDiagnosisSuggestion[]): { filtered: ValidatedSuggestion[]; adjustments: unknown[] } {
  const MIN_CONFIDENCE = 0.15;
  const MAX_CONFIDENCE = 0.95;
  const filtered: ValidatedSuggestion[] = [];
  const adjustments: unknown[] = [];

  for (const s of suggestions) {
    if (s.confidence < MIN_CONFIDENCE) continue;
    const validated: ValidatedSuggestion = { ...s, rag_verified: false, confidence_adjusted: false, validation_flags: [] };

    if (s.confidence > MAX_CONFIDENCE) {
      validated.original_confidence = s.confidence;
      validated.confidence = MAX_CONFIDENCE;
      validated.confidence_adjusted = true;
      validated.validation_flags.push({ type: 'warning', code: 'OVERCONFIDENCE', message: `Confidence diturunkan ke ${MAX_CONFIDENCE * 100}%` });
      adjustments.push({ code: s.icd10_code, from: s.confidence, to: MAX_CONFIDENCE });
    }

    validated.validation_flags.push({
      type: 'info',
      code: s.confidence >= 0.6 ? 'CONFIDENCE_TIER_PRIMARY' : 'CONFIDENCE_TIER_SECONDARY',
      message: s.confidence >= 0.6 ? 'Kepercayaan tinggi' : 'Kepercayaan sedang',
    });

    filtered.push(validated);
  }

  filtered.sort((a, b) => b.confidence - a.confidence);
  filtered.forEach((s, i) => { s.rank = i + 1; });
  return { filtered, adjustments };
}

// ── Main Pipeline ─────────────────────────────────────────────────────────────

export async function runValidationPipeline(
  rawSuggestions: AIDiagnosisSuggestion[],
  context: ValidationContext,
): Promise<ValidationResult> {
  const layerResults: LayerResult[] = [];
  const warnings: string[] = [];

  // Layer 1
  const syntaxResult = validateSyntax(rawSuggestions as unknown[]);
  layerResults.push({ layer: 1, name: 'Syntax Validation', passed: syntaxResult.passed, affected_count: rawSuggestions.length - syntaxResult.valid.length, details: syntaxResult.errors });
  if (!syntaxResult.passed) return { valid: false, layer_passed: 1, filtered_suggestions: [], unverified_codes: [], red_flags: context.existing_red_flags, warnings: syntaxResult.errors, layer_results: layerResults };

  let current = syntaxResult.valid;

  // Layer 2
  const schemaResult = await validateSchema(current);
  layerResults.push({ layer: 2, name: 'ICD-10 Schema', passed: schemaResult.passed, affected_count: schemaResult.unverified.length, details: schemaResult.unverified.map(c => `Unverified: ${c}`) });
  if (schemaResult.unverified.length > 0) warnings.push(`${schemaResult.unverified.length} kode ICD-10 tidak terverifikasi`);

  // Layer 3
  const clinicalResult = validateClinical(current, context);
  layerResults.push({ layer: 3, name: 'Clinical Plausibility', passed: clinicalResult.passed, affected_count: clinicalResult.removed.length, details: clinicalResult.removed.map(r => `${r.code}: ${r.reason}`) });
  if (!clinicalResult.passed) warnings.push('Semua saran tidak sesuai profil pasien');
  current = clinicalResult.filtered;

  // Layer 4
  const safetyResult = integrateSafety(current, context.existing_red_flags, schemaResult.entries);
  layerResults.push({ layer: 4, name: 'Safety Integration', passed: true, affected_count: context.existing_red_flags.length, details: context.existing_red_flags.map(f => `Red flag: ${f.condition}`) });
  current = safetyResult;

  // Layer 5
  const confidenceResult = filterConfidence(current);
  layerResults.push({ layer: 5, name: 'Confidence Filtering', passed: confidenceResult.filtered.length > 0, affected_count: current.length - confidenceResult.filtered.length, details: [] });

  for (const s of confidenceResult.filtered) {
    s.rag_verified = schemaResult.verified.get(s.icd10_code) ?? false;
    if (!s.rag_verified) s.validation_flags.push({ type: 'warning', code: 'UNVERIFIED_CODE', message: 'Kode ICD-10 tidak terverifikasi' });
  }

  return {
    valid: confidenceResult.filtered.length > 0,
    layer_passed: 5,
    filtered_suggestions: confidenceResult.filtered,
    unverified_codes: schemaResult.unverified,
    red_flags: context.existing_red_flags,
    warnings,
    layer_results: layerResults,
  };
}

export type { ValidationResult, ValidatedSuggestion, ValidationFlag, ValidationContext, LayerResult } from './types';

