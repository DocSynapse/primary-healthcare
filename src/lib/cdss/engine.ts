/**
 * Iskandar Diagnosis Engine V1 — CDSS Engine Orchestrator
 * Adapted for Next.js puskesmas dashboard.
 * No Encounter type, no Chrome Extension deps, no RAG/IndexedDB.
 *
 * PIPELINE:
 * 1. Anonymize  → Strip PII
 * 2. Red Flags  → Hardcoded emergency detection (no API)
 * 3. Symptom Matcher → IDF+Coverage+Jaccard against 144-disease KB
 * 4. Epidemiology Weights → Bayesian prior from 45,030 real cases
 * 5. LLM Reasoner → Constrained Gemini enrichment (with KB-only fallback)
 * 6. Traffic Light → 8-rule safety gate (escalation-only)
 * 7. Validation → ICD-10 verification + confidence adjustment
 * 8. Audit Log → Append-only governance trail
 */

import type { VitalSigns } from './types';
import type { RedFlag } from './red-flags';
import type { ValidatedSuggestion, ValidationResult } from './validation/types';
import type { TrafficLightLevel } from './traffic-light';

import { anonymize, validateAnonymization } from './anonymizer';
import { logDiagnosisRequest, logSuggestionDisplayed } from './audit-logger';
import { runRedFlagChecksFromContext } from './red-flags';
import { matchSymptoms, getKBDiseaseCount } from './symptom-matcher';
import { applyEpidemiologyWeights, getEpidemiologyMeta, getLocalEpidemiologyContext } from './epidemiology-weights';
import { classifyTrafficLight } from './traffic-light';
import { runLLMReasoning } from './llm-reasoner';
import { runValidationPipeline } from './validation';
import { dataProvider } from './data-provider';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AlertSeverity = 'emergency' | 'high' | 'medium' | 'low' | 'info';
export type CDSSAlertType = 'red_flag' | 'vital_sign' | 'validation_warning' | 'low_confidence' | 'guideline';

export interface CDSSAlert {
  id: string;
  type: CDSSAlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  icd_codes?: string[];
  action?: string;
}

export interface CDSSEngineResult {
  suggestions: ValidatedSuggestion[];
  red_flags: RedFlag[];
  alerts: CDSSAlert[];
  processing_time_ms: number;
  source: 'ai' | 'local' | 'error';
  model_version: string;
  validation_summary: {
    total_raw: number;
    total_validated: number;
    unverified_codes: string[];
    warnings: string[];
  };
}

/** Input dari form EMR dashboard — tidak memerlukan Encounter type dari Assist */
export interface CDSSEngineInput {
  keluhan_utama: string;
  keluhan_tambahan?: string;
  usia: number;                       // tahun
  jenis_kelamin: 'L' | 'P';
  vital_signs?: VitalSigns;
  allergies?: string[];
  chronic_diseases?: string[];
  is_pregnant?: boolean;
  current_drugs?: string[];           // untuk DDI check di masa depan
  session_id?: string;                // untuk audit trail
}

export interface CDSSEngineConfig {
  enableAI: boolean;
  maxSuggestions: number;
  minConfidence: number;
  enableAudit: boolean;
}

export const DEFAULT_ENGINE_CONFIG: CDSSEngineConfig = {
  enableAI: true,
  maxSuggestions: 5,
  minConfidence: 0.10,
  enableAudit: true,
};

export interface CDSSEngineStatus {
  ready: boolean;
  kb_disease_count: number;
  model: string;
  audit_entries: number;
  last_error?: string;
}

// ── Utilities ────────────────────────────────────────────────────────────────

function generateAlertId(): string {
  return `alert-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function generateSessionId(input: CDSSEngineInput): string {
  return input.session_id ?? `session-${Date.now()}`;
}

function mapRedFlagSeverity(severity: RedFlag['severity']): CDSSAlert['severity'] {
  const map: Record<RedFlag['severity'], CDSSAlert['severity']> = { emergency: 'emergency', urgent: 'high', warning: 'medium' };
  return map[severity];
}

function redFlagsToAlerts(redFlags: RedFlag[]): CDSSAlert[] {
  return redFlags.map(flag => ({
    id: generateAlertId(),
    type: 'red_flag' as const,
    severity: mapRedFlagSeverity(flag.severity),
    title: flag.condition,
    message: flag.criteria_met.join('; '),
    icd_codes: flag.icd_codes,
    action: flag.action,
  }));
}

function validationToAlerts(validation: ValidationResult): CDSSAlert[] {
  const alerts: CDSSAlert[] = [];
  if (validation.unverified_codes.length > 0) {
    alerts.push({
      id: generateAlertId(),
      type: 'validation_warning',
      severity: 'medium',
      title: 'Kode ICD-10 Tidak Terverifikasi',
      message: `${validation.unverified_codes.length} kode tidak ditemukan di database lokal`,
      icd_codes: validation.unverified_codes,
    });
  }
  for (const warning of validation.warnings) {
    alerts.push({ id: generateAlertId(), type: 'validation_warning', severity: 'low', title: 'Peringatan Validasi', message: warning });
  }
  return alerts;
}

function trafficLightToAlert(level: TrafficLightLevel, reason: string): CDSSAlert | null {
  if (level === 'GREEN') return null;
  return {
    id: generateAlertId(),
    type: level === 'RED' ? 'red_flag' : 'vital_sign',
    severity: level === 'RED' ? 'high' : 'medium',
    title: level === 'RED' ? 'Perhatian: Rujukan Segera Direkomendasikan' : 'Perhatian: Monitor Ketat Diperlukan',
    message: reason,
    action: level === 'RED' ? 'Stabilisasi dan rujuk ke fasilitas yang lebih tinggi.' : 'Monitor TTV serial, pertimbangkan pemeriksaan penunjang.',
  };
}

function buildConservativeValidationFallback(
  rawSuggestions: Array<{ rank: number; diagnosis_name: string; icd10_code: string; confidence: number; reasoning: string; red_flags?: string[]; recommended_actions?: string[] }>,
): ValidationResult {
  const filtered_suggestions = rawSuggestions.slice(0, 5).map((s, i) => ({
    ...s,
    rank: s.rank || i + 1,
    confidence: Math.min(0.5, s.confidence),
    rag_verified: false,
    confidence_adjusted: true,
    original_confidence: s.confidence,
    validation_flags: [{ type: 'warning' as const, code: 'VALIDATION_DEGRADED', message: 'Pipeline validasi penuh tidak tersedia, confidence diturunkan konservatif.' }],
    red_flags: s.red_flags ?? [],
    recommended_actions: s.recommended_actions ?? [],
  }));
  return {
    valid: false,
    layer_passed: 1,
    filtered_suggestions,
    unverified_codes: filtered_suggestions.map(s => s.icd10_code),
    red_flags: [],
    warnings: ['Validation pipeline degraded: menggunakan fallback konservatif.'],
    layer_results: [{ layer: 1, name: 'Syntax Validation', passed: true, affected_count: filtered_suggestions.length, details: ['Fallback aktif.'] }],
  };
}

// ── Main Engine ───────────────────────────────────────────────────────────────

export async function runDiagnosisEngine(
  input: CDSSEngineInput,
  config: CDSSEngineConfig = DEFAULT_ENGINE_CONFIG,
): Promise<CDSSEngineResult> {
  const startTime = Date.now();
  const sessionId = generateSessionId(input);
  const alerts: CDSSAlert[] = [];
  const warnings: string[] = [];

  // ── Step 1: Anonymize ──────────────────────────────────────────────────────
  const anonymizedContext = anonymize({
    keluhanUtama: input.keluhan_utama,
    keluhanTambahan: input.keluhan_tambahan,
    usia: input.usia,
    jenisKelamin: input.jenis_kelamin,
    vitals: input.vital_signs,
    allergies: input.allergies,
    chronicDiseases: input.chronic_diseases,
    isPregnant: input.is_pregnant ?? false,
  });

  const anonValidation = validateAnonymization(anonymizedContext);
  if (!anonValidation.valid) {
    console.error('[IDE-V1] CRITICAL: Anonymization validation failed!', anonValidation.violations);
    throw new Error(`PII leak detected: ${anonValidation.violations.join(', ')}`);
  }

  if (config.enableAudit) {
    logDiagnosisRequest({
      session_id: sessionId,
      input_context: JSON.stringify(anonymizedContext),
      model_version: 'IDE-V1',
    }).catch(console.error);
  }

  // ── Step 2, 3, 4: Parallel Processing ──────────────────────────────────────
  // We can run Red Flags, Symptom Matching, and Epidemiology Context in parallel
  const [redFlags, candidatesRaw, epiContext] = await Promise.all([
    runRedFlagChecksFromContext(anonymizedContext),
    matchSymptoms({
      keluhanUtama: anonymizedContext.keluhan_utama,
      keluhanTambahan: anonymizedContext.keluhan_tambahan,
      usia: anonymizedContext.usia_tahun,
      jenisKelamin: anonymizedContext.jenis_kelamin,
      vitalSigns: anonymizedContext.vital_signs, // INTEGRATED V2 Vitals
    }, 10),
    getLocalEpidemiologyContext(15)
  ]);

  if (redFlags.length > 0) {
    console.warn(`[IDE-V1] ${redFlags.length} red flag(s) detected`);
    alerts.push(...redFlagsToAlerts(redFlags));
  }

  // ── Step 4: Epidemiology Weights ───────────────────────────────────────────
  const candidates = await applyEpidemiologyWeights(candidatesRaw, anonymizedContext.jenis_kelamin);

  // ── Step 5: LLM Reasoner ───────────────────────────────────────────────────
  const reasonerResult = await runLLMReasoning({
    candidates,
    keluhanUtama: anonymizedContext.keluhan_utama,
    keluhanTambahan: anonymizedContext.keluhan_tambahan,
    usia: anonymizedContext.usia_tahun,
    jenisKelamin: anonymizedContext.jenis_kelamin,
    epiContext,
  });

  const matcherSource = reasonerResult.source;
  const modelVersion = reasonerResult.modelVersion;
  if (reasonerResult.dataQualityWarnings.length > 0) warnings.push(...reasonerResult.dataQualityWarnings);

  // ── Step 6: Traffic Light ──────────────────────────────────────────────────
  const topConfidence = reasonerResult.suggestions.length > 0 ? reasonerResult.suggestions[0].confidence : 0;
  const trafficLight = classifyTrafficLight({
    candidates,
    redFlags,
    patientAge: anonymizedContext.usia_tahun,
    patientGender: anonymizedContext.jenis_kelamin,
    chronicDiseases: anonymizedContext.chronic_diseases,
    confidence: topConfidence,
  });
  const tlAlert = trafficLightToAlert(trafficLight.level, trafficLight.reason);
  if (tlAlert) alerts.push(tlAlert);

  // ── Step 7: Validation ─────────────────────────────────────────────────────
  const rawSuggestions = reasonerResult.suggestions;
  let validationResult: ValidationResult;
  try {
    validationResult = await runValidationPipeline(rawSuggestions, {
      patient_age: anonymizedContext.usia_tahun,
      patient_gender: anonymizedContext.jenis_kelamin,
      is_pregnant: anonymizedContext.is_pregnant ?? false,
      keluhan_utama: anonymizedContext.keluhan_utama,
      existing_red_flags: redFlags,
      vital_signs: anonymizedContext.vital_signs,
    });
  } catch {
    validationResult = buildConservativeValidationFallback(rawSuggestions);
    warnings.push('Validation pipeline degraded: menggunakan fallback konservatif.');
  }
  alerts.push(...validationToAlerts(validationResult));

  const filteredSuggestions = validationResult.filtered_suggestions
    .filter(s => s.confidence >= config.minConfidence)
    .slice(0, config.maxSuggestions);

  if (filteredSuggestions.length > 0) {
    const avgConf = filteredSuggestions.reduce((sum, s) => sum + s.confidence, 0) / filteredSuggestions.length;
    if (avgConf < 0.3) {
      alerts.push({ id: generateAlertId(), type: 'low_confidence', severity: 'info', title: 'Kepercayaan Rendah', message: 'Saran diagnosis memiliki tingkat kepercayaan rendah. Pertimbangkan anamnesis tambahan.' });
    }
  }

  // ── Step 8: Audit ──────────────────────────────────────────────────────────
  const processingTime = Date.now() - startTime;
  if (config.enableAudit) {
    logSuggestionDisplayed({
      session_id: sessionId,
      suggestions: filteredSuggestions.map(s => ({ icd10_code: s.icd10_code, confidence: s.confidence })),
      red_flag_count: redFlags.length,
      model_version: modelVersion || 'IDE-V2',
      latency_ms: processingTime,
      validation_status: validationResult.valid ? 'PASS' : validationResult.layer_passed >= 3 ? 'WARN' : 'FAIL',
    }).catch(console.error);
  }

  // Mandatory disclaimer (Governance Rule 3)
  alerts.push({ id: generateAlertId(), type: 'guideline', severity: 'info', title: 'Disclaimer', message: 'Ini adalah alat bantu keputusan klinis. Keputusan akhir ada pada dokter.' });

  return {
    suggestions: filteredSuggestions,
    red_flags: redFlags,
    alerts,
    processing_time_ms: processingTime,
    source: matcherSource,
    model_version: modelVersion || 'IDE-V2-SEMANTIC',
    validation_summary: {
      total_raw: rawSuggestions.length,
      total_validated: filteredSuggestions.length,
      unverified_codes: validationResult.unverified_codes,
      warnings: [...validationResult.warnings, ...warnings],
    },
  };
}

// ── Status & Diagnostics ──────────────────────────────────────────────────────

export async function getCDSSEngineStatus(): Promise<CDSSEngineStatus> {
  try {
    const { auditLogger } = await import('./audit-logger');
    const kbCount = await getKBDiseaseCount();
    const auditCount = await auditLogger.getEntryCount();
    return { ready: kbCount > 0, kb_disease_count: kbCount, model: 'IDE-V2-SEMANTIC', audit_entries: auditCount };
  } catch (error) {
    return { ready: false, kb_disease_count: 0, model: 'IDE-V2-SEMANTIC', audit_entries: 0, last_error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function initCDSSEngine(): Promise<boolean> {
  try {
    console.log('[IDE-V2] Initializing Iskandar Semantic Engine V2...');
    await dataProvider.initialize();
    const kbCount = await getKBDiseaseCount();
    await getEpidemiologyMeta();
    console.log(`[IDE-V2] Ready. KB: ${kbCount} diseases. Model: IDE-V2-SEMANTIC (Gemini 2.0 Flash)`);
    return kbCount > 0;
  } catch (error) {
    console.error('[IDE-V2] Initialization failed:', error);
    return false;
  }
}
