/**
 * Iskandar Diagnosis Engine V1 — Public API
 * CDSS module for puskesmas dashboard.
 */

// Engine
export { runDiagnosisEngine, initCDSSEngine, getCDSSEngineStatus, DEFAULT_ENGINE_CONFIG } from './engine';
export type { CDSSEngineResult, CDSSEngineInput, CDSSEngineConfig, CDSSEngineStatus, CDSSAlert, AlertSeverity, CDSSAlertType } from './engine';

// Anonymizer
export { anonymize, redactPII, validateAnonymization, containsPII } from './anonymizer';

// Red Flags
export { runRedFlagChecks, runRedFlagChecksFromContext, checkSepsis, checkACS, checkPreeclampsia, checkStroke, checkHypoglycemia, checkAnaphylaxis } from './red-flags';
export type { RedFlag, RedFlagContext } from './red-flags';

// Symptom Matcher
export { matchSymptoms, getKBDiseaseCount } from './symptom-matcher';
export type { MatcherInput, MatchedCandidate } from './symptom-matcher';

// Epidemiology Weights
export { applyEpidemiologyWeights, getLocalEpidemiologyContext, getEpidemiologyMeta } from './epidemiology-weights';

// Traffic Light
export { classifyTrafficLight } from './traffic-light';
export type { TrafficLightLevel, TrafficLightInput, TrafficLightOutput } from './traffic-light';

// LLM Reasoner
export { runLLMReasoning } from './llm-reasoner';
export type { ReasonerInput, ReasonerOutput } from './llm-reasoner';

// Validation
export { runValidationPipeline } from './validation';
export type { ValidationResult, ValidatedSuggestion, ValidationFlag, ValidationContext, LayerResult } from './validation/types';

// Audit Logger
export { auditLogger, logDiagnosisRequest, logSuggestionDisplayed, logSuggestionSelected, logRedFlagShown, logEngineError, logFallbackUsed } from './audit-logger';
export type { AuditEntry, AuditAction } from './audit-logger';

// DDI Checker
export { loadDDIDatabase, getDDIStatus, checkDrugInteractions, hasBlockingInteractions, getSeverityLabel, getSeverityColor } from './ddi-checker';
export type { DDISeverity, DrugInteraction } from './ddi-checker';

// Shared Types
export type { VitalSigns, AnonymizedClinicalContext, AIDiagnosisSuggestion } from './types';
