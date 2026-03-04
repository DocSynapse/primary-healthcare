"use client";

import { useState, useRef, useEffect } from "react";
import EMRTransferPanel from "./EMRTransferPanel";
import { generateNarrative } from "@/lib/narrative-generator";
import { inferVitals, getRandomNormal, NORMAL_RANGES } from "@/lib/ttv-inference";
import {
  classifyHypertension, getHTNRecommendations,
  BP_THRESHOLDS,
  type BPMeasurementSession,
} from "@/lib/htn-classifier";
import { classifyBloodGlucose, type GlucoseData } from "@/lib/glucose-classifier";
import { detectOccultShock } from "@/lib/occult-shock-detector";
import TrajectoryPanel from "./TrajectoryPanel";


// Screening Alert — Gate 2/3/4 clinical decision alerts
interface ScreeningAlert {
  id: string;
  gate: "GATE_2_HTN" | "GATE_3_GLUCOSE" | "GATE_4_OCCULT_SHOCK";
  type: string;
  severity: "critical" | "high" | "warning";
  title: string;
  reasoning: string;
  recommendations: string[];
}

// Iskandar Engine V1 response types
interface CDSSSuggestion {
  rank: number;
  icd10_code: string;
  diagnosis_name: string;
  confidence: number;
  reasoning: string;
  red_flags?: string[];
  recommended_actions?: string[];
  rag_verified?: boolean;
  validation_flags?: Array<{ type: string; code: string; message: string }>;
}
interface CDSSRedFlag {
  severity: "emergency" | "urgent" | "warning";
  condition: string;
  action: string;
  criteria_met: string[];
}
interface CDSSAlert {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  icd_codes?: string[];
  action?: string;
}
interface CDSSResult {
  suggestions: CDSSSuggestion[];
  red_flags: CDSSRedFlag[];
  alerts: CDSSAlert[];
  processing_time_ms: number;
  source: "ai" | "local" | "error";
  model_version: string;
  validation_summary: {
    total_raw: number;
    total_validated: number;
    unverified_codes: string[];
    warnings: string[];
  };
}

export default function EMRPage() {
  const [headerText, setHeaderText] = useState("SENTRA / PUSKESMAS KEDIRI // RM-BARU // SENAUTO ENGINE: IDLE");
  const [headerColor, setHeaderColor] = useState("var(--text-muted)");
  const [isTyping, setIsTyping] = useState(false);
  const [ghostVisible, setGhostVisible] = useState(true);
  const [words, setWords] = useState<string[]>([]);
  const [anamnesaVisible, setAnamnesaVisible] = useState([false, false, false]);
  const [showEmrLoader, setShowEmrLoader] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [draftBorderColor, setDraftBorderColor] = useState("var(--text-muted)");

  const [activeScenario, setActiveScenario] = useState<string | null>(null);

  // ── Patient Context (Critical for CDSS V3.4) ──────────────────────────────
  const [patientAge, setPatientAge] = useState<number>(35);
  const [patientGender, setPatientGender] = useState<"L" | "P">("L");

  const [labOpen, setLabOpen] = useState(false);
  const [labSelected, setLabSelected] = useState([false, false, false]);
  const [examOpen, setExamOpen] = useState(false);

  const [trajectoryActive, setTrajectoryActive] = useState(false);
  const [trajectoryOpen, setTrajectoryOpen] = useState(false);
  const [showInsight, setShowInsight] = useState(false);
  const insightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keluhanRef = useRef({ utama: "", tambahan: "" });

  const [cdssResult, setCdssResult]         = useState<CDSSResult | null>(null);
  const [cdssLoading, setCdssLoading]       = useState(false);
  const [cdssError, setCdssError]           = useState("");
  const [screeningAlerts, setScreeningAlerts] = useState<ScreeningAlert[]>([]);

  // Editable vitals state
  const [vitals, setVitals] = useState({
    gcs: "", td: "", nadi: "", napas: "", suhu: "", spo2: "", map: "",
  });
  const [gulaDarah, setGulaDarah] = useState({ nilai: "", tipe: "GDS" as "GDS" | "GDP" | "2JPP" });

  // Editable anamnesa
  const [keluhanUtama, setKeluhanUtama] = useState("");
  const [keluhanTambahan, setKeluhanTambahan] = useState("");
  const [keluhanAsli, setKeluhanAsli] = useState(""); // teks asli sebelum SenAuto transform
  const [anamnesaEntities, setAnamnesaEntities] = useState({ utama: "", onset: "", faktor: "" });

  // Editable exam
  const [exam, setExam] = useState({
    kepala: "", dada: "", perut: "", ekstremitas: "", kulit: "", genitalia: "",
  });

  // Riwayat penyakit & alergi
  const [riwayat, setRiwayat] = useState({ rps: "", rpk: "" });
  const [rpdSelected, setRpdSelected] = useState<Set<string>>(new Set());
  const [alergiSelected, setAlergiSelected] = useState<Set<string>>(new Set());

  const RPD_OPTIONS = [
    "Hipertensi", "Diabetes Mellitus Tipe 2", "Tuberkulosis Paru",
    "Asma Bronkial", "Gastritis / GERD", "Stroke",
    "Penyakit Jantung Koroner", "Gagal Ginjal Kronis",
    "Hepatitis B", "Dislipidemia",
  ];
  const ALERGI_OPTIONS = ["Penisilin / Antibiotik", "Seafood / Kacang", "Debu / Serbuk Sari", "NSAID / Aspirin"];

  function toggleRpd(val: string) {
    setRpdSelected(prev => { const s = new Set(prev); s.has(val) ? s.delete(val) : s.add(val); return s; });
  }
  function toggleAlergi(val: string) {
    setAlergiSelected(prev => { const s = new Set(prev); s.has(val) ? s.delete(val) : s.add(val); return s; });
  }

  function handleSenAutoClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (isTyping || !keluhanUtama.trim()) return;

    // Simpan teks asli untuk inferTTV, lalu generate narasi klinis
    setKeluhanAsli(keluhanUtama);
    const result = generateNarrative(keluhanUtama);
    const narrative = result.keluhan_utama || keluhanUtama;
    setKeluhanUtama(narrative);

    setIsTyping(true);
    setGhostVisible(false);
    setDraftBorderColor("var(--c-asesmen)");
    setHeaderText("SENTRA // RM-BARU // SENAUTO ENGINE: SYNTHESIZING...");
    setHeaderColor("var(--c-asesmen)");
    setWords(narrative.split(/\s+/));

    const totalTime = (narrative.split(/\s+/).length * 80) + 800;

    setTimeout(() => {
      setHeaderText("SENTRA // RM-BARU // EMR RETRIEVAL ACTIVE");
      setShowEmrLoader(true);

      [0, 1, 2].forEach((i) => {
        setTimeout(() => {
          setAnamnesaVisible((prev) => {
            const next = [...prev];
            next[i] = true;
            return next;
          });
        }, i * 200);
      });

      setTimeout(() => {
        setShowEmrLoader(false);
        setHistoryLoaded(true);
        setHeaderText("SENTRA // RM-BARU // Synthesia Engine: READY");
        setAnamnesaVisible([true, true, true]);
        setAnamnesaEntities({
          utama: result.entities?.keluhan_utama || "",
          onset: result.entities?.onset_durasi || "",
          faktor: result.entities?.faktor_pemberatan || "",
        });
        setIsTyping(false);
        setWords([]);
      }, 1500);
    }, totalTime);
  }

  function toggleTrajectory() {
    const next = !trajectoryActive;
    setTrajectoryActive(next);
    setTrajectoryOpen(next);
    if (next) {
      if (insightTimeoutRef.current) clearTimeout(insightTimeoutRef.current);
      setShowInsight(true);
    } else {
      insightTimeoutRef.current = setTimeout(() => setShowInsight(false), 800);
    }
  }

  function toggleLab(index: number) {
    setLabSelected((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  }

  async function runCDSS() {
    if (!keluhanUtama.trim()) return;
    setCdssLoading(true);
    setCdssError("");
    setCdssResult(null);

    const parseTD = (td: string) => {
      const parts = td.replace("/", " ").split(/[\s/]+/);
      return { sbp: parseFloat(parts[0]) || undefined, dbp: parseFloat(parts[1]) || undefined };
    };
    const { sbp, dbp } = vitals.td ? parseTD(vitals.td) : { sbp: undefined, dbp: undefined };

    // Gabung keluhan tambahan + RPS + RPK untuk konteks klinis lengkap
    const keluhanKombinasi = [
      keluhanTambahan,
      riwayat.rps ? `RPS: ${riwayat.rps}` : "",
      riwayat.rpk ? `RPK: ${riwayat.rpk}` : "",
    ].filter(Boolean).join(". ") || undefined;

          try {
      const res = await fetch("/api/cdss/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keluhan_utama: keluhanUtama,
          keluhan_tambahan: keluhanKombinasi,
          vital_signs: {
            systolic: sbp,
            diastolic: dbp,
            heart_rate: parseFloat(vitals.nadi) || undefined,
            respiratory_rate: parseFloat(vitals.napas) || undefined,
            temperature: parseFloat(vitals.suhu) || undefined,
            spo2: parseFloat(vitals.spo2) || undefined,
            gcs: parseFloat(vitals.gcs) || undefined,
            glucose: parseFloat(gulaDarah.nilai) || undefined,
          },
          chronic_diseases: rpdSelected.size > 0 ? Array.from(rpdSelected) : undefined,
          allergies: alergiSelected.size > 0 ? Array.from(alergiSelected) : undefined,
          age: patientAge,
          gender: patientGender,
        }),
      });
      const data = await res.json() as CDSSResult;
      setCdssResult(data);
    } catch {
      setCdssError("Gagal menjalankan CDSS. Coba lagi.");
    } finally {
      setCdssLoading(false);
    }
  }

  // ── TTV Inference — Gate 1: pakai Assist inferVitals + BP_THRESHOLDS ────────

  function inferTTV(overrideKeluhan?: string) {
    // ── Read Warning: Clinical Guardrail ──────────────────────────────────
    const confirmInference = window.confirm(
      "PERINGATAN KLINIS: Fitur Auto-TTV akan melakukan inferensi data vital berdasarkan keluhan. \\n\\n" +
      "Data ini bersifat SARAN dan HARUS divalidasi ulang dengan pemeriksaan fisik nyata. \\n" +
      "Lanjutkan sinkronisasi narasi klinis?"
    );
    if (!confirmInference) return;

    const rpdStr = Array.from(rpdSelected).join(" ").toLowerCase();
    const baseComplaint = overrideKeluhan ?? (keluhanRef.current.utama + " " + keluhanRef.current.tambahan);
    const complaint = (baseComplaint + " " + rpdStr).toLowerCase();

    // Pulse, RR, Temp — dari Assist inferVitals (sama persis)
    const inferred = inferVitals(complaint);

    // TD — pakai BP_THRESHOLDS dari htn-classifier (bukan hardcode)
    const isHtn = complaint.includes("hipertensi") || complaint.includes("darah tinggi");
    const sbpRange = isHtn
      ? { min: BP_THRESHOLDS.STAGE1.sbp, max: BP_THRESHOLDS.STAGE2.sbp }
      : { min: 100, max: BP_THRESHOLDS.NORMAL.sbp };
    const dbpRange = isHtn
      ? { min: BP_THRESHOLDS.STAGE1.dbp, max: BP_THRESHOLDS.STAGE2.dbp }
      : { min: 65, max: BP_THRESHOLDS.NORMAL.dbp };
    const sbp = getRandomNormal(sbpRange.min, sbpRange.max);
    const dbp = getRandomNormal(dbpRange.min, dbpRange.max);

    // SpO2 — inline (Assist TTVInferenceUI pattern)
    const isSesak = complaint.includes("sesak") || complaint.includes("dyspnea") || complaint.includes("asma");
    const spo2 = getRandomNormal(isSesak ? 88 : 96, isSesak ? 94 : 99);

    // GCS
    const gcs = (complaint.includes("tidak sadar") || complaint.includes("penurunan kesadaran")) ? 14 : 15;

    const newVitals = {
      gcs:   String(gcs),
      td:    `${sbp}/${dbp}`,
      nadi:  String(inferred.values.pulse  ?? getRandomNormal(NORMAL_RANGES.pulse.min,  NORMAL_RANGES.pulse.max)),
      napas: String(inferred.values.rr     ?? getRandomNormal(NORMAL_RANGES.rr.min,     NORMAL_RANGES.rr.max)),
      suhu:  String(inferred.values.temp   ?? getRandomNormal(NORMAL_RANGES.temp.min,   NORMAL_RANGES.temp.max, 1)),
      spo2:  String(spo2),
      map:   String(Math.round((sbp + 2 * dbp) / 3)),
    };
    
    setVitals(newVitals);

    setHeaderText("SENTRA // RM-BARU // Synthesia Engine: TTV INFERRED — VALIDATION REQUIRED");
    setHeaderColor("var(--c-asesmen)");
  }

  // ── Gate 2/3/4 Alert Engine — sama persis pola Assist TTVInferenceUI.tsx ──
  useEffect(() => {
    const alerts: ScreeningAlert[] = [];
    const [sbpStr, dbpStr] = (vitals.td || "/").split("/");
    const sbpNum = parseInt(sbpStr) || 0;
    const dbpNum = parseInt(dbpStr) || 0;
    const glucoseNum = parseInt(gulaDarah.nilai) || 0;

    // Gate 2: HTN
    if (sbpNum > 0) {
      const bpSession: BPMeasurementSession = {
        readings: [{ sbp: sbpNum, dbp: dbpNum }],
        measurement_quality: "acceptable",
        final_bp: { sbp: sbpNum, dbp: dbpNum },
      };
      const htnResult = classifyHypertension(bpSession);
      if (sbpNum >= BP_THRESHOLDS.CRISIS.sbp) {
        alerts.push({
          id: "gate2-htn", gate: "GATE_2_HTN", type: "ht_crisis",
          severity: "critical", title: "HTN EMERGENCY — RUJUK IGD",
          reasoning: htnResult.reasoning,
          recommendations: getHTNRecommendations(htnResult.type, { sbp: sbpNum, dbp: dbpNum }),
        });
      } else if (sbpNum >= BP_THRESHOLDS.STAGE2.sbp) {
        alerts.push({
          id: "gate2-htn", gate: "GATE_2_HTN", type: "ht_urgency",
          severity: "high", title: "HTN URGENCY — CAPTOPRIL SL",
          reasoning: htnResult.reasoning,
          recommendations: getHTNRecommendations(htnResult.type, { sbp: sbpNum, dbp: dbpNum }),
        });
      }
    }

    // Gate 3: Glucose
    if (glucoseNum > 0) {
      const glucoseData: GlucoseData = {
        gds: glucoseNum, sample_type: "capillary", has_classic_symptoms: false,
      };
      const glucoseResult = classifyBloodGlucose(glucoseData);
      if (glucoseResult.category === "HYPOGLYCEMIA_CRISIS") {
        alerts.push({
          id: "gate3-hipo", gate: "GATE_3_GLUCOSE", type: "hypoglycemia",
          severity: "critical", title: `HIPOGLIKEMIA — GDS ${glucoseNum} mg/dL`,
          reasoning: glucoseResult.reasoning,
          recommendations: glucoseResult.recommendations,
        });
      } else if (glucoseResult.category === "DIABETES_CONFIRMED" || glucoseResult.category === "HYPERGLYCEMIA_CRISIS") {
        alerts.push({
          id: "gate3-hiper", gate: "GATE_3_GLUCOSE", type: "hyperglycemia",
          severity: glucoseResult.category === "HYPERGLYCEMIA_CRISIS" ? "critical" : "high",
          title: `${glucoseResult.category} — GDS ${glucoseNum} mg/dL`,
          reasoning: glucoseResult.reasoning,
          recommendations: glucoseResult.recommendations,
        });
      } else if (glucoseResult.category === "PREDIABETES") {
        alerts.push({
          id: "gate3-pre", gate: "GATE_3_GLUCOSE", type: "hyperglycemia",
          severity: "warning",
          title: `PREDIABETES — GDS ${glucoseNum} mg/dL`,
          reasoning: glucoseResult.reasoning,
          recommendations: glucoseResult.recommendations,
        });
      }
    }

    // Gate 4: Occult Shock (hanya jika RPD Hipertensi)
    if (sbpNum > 0 && rpdSelected.has("Hipertensi")) {
      const shockResult = detectOccultShock({
        vitals: { current_sbp: sbpNum, current_dbp: dbpNum, glucose: glucoseNum || undefined },
        last_3_visits: [],
        symptoms: { dizziness: false, presyncope: false, syncope: false, weakness: false },
        known_htn: true,
      });
      if (shockResult.risk_level === "CRITICAL" || shockResult.risk_level === "HIGH") {
        alerts.push({
          id: "gate4-shock", gate: "GATE_4_OCCULT_SHOCK", type: "occult_shock",
          severity: shockResult.risk_level === "CRITICAL" ? "critical" : "high",
          title: `OCCULT SHOCK — ${shockResult.risk_level}`,
          reasoning: shockResult.triggers.join("; "),
          recommendations: shockResult.recommendations,
        });
      }
    }

    setScreeningAlerts(alerts);
  }, [vitals.td, gulaDarah.nilai, rpdSelected]);

  // ── Auto-generate skenario klinis ────────────────────────────────────────
  const AUTOGEN_SCENARIOS = {
    hipertensi: {
      label: "HIPERTENSI",
      keluhan_utama: "nyeri kepala bagian belakang, tengkuk terasa berat",
      keluhan_tambahan: "pandangan kadang kabur, riwayat hipertensi sejak 3 tahun",
      vitals: { gcs: "15", td: "170/100", nadi: "88", napas: "18", suhu: "36.8", spo2: "97", map: "123" },
    },
    hiperglikemi: {
      label: "HIPERGLIKEMIA",
      keluhan_utama: "sering buang air kecil, haus terus, badan lemas",
      keluhan_tambahan: "penurunan berat badan 5 kg dalam 1 bulan, riwayat DM tipe 2",
      vitals: { gcs: "15", td: "130/85", nadi: "92", napas: "20", suhu: "37.2", spo2: "98", map: "100" },
    },
    hipoglikemi: {
      label: "HIPOGLIKEMIA",
      keluhan_utama: "tangan gemetar, keringat dingin, pusing mendadak",
      keluhan_tambahan: "pasien DM pengguna insulin, telat makan siang, sempat lemas",
      vitals: { gcs: "14", td: "100/65", nadi: "110", napas: "22", suhu: "36.5", spo2: "96", map: "77" },
    },
  } as const;

  function autoFillScenario(key: keyof typeof AUTOGEN_SCENARIOS) {
    // Toggle: klik lagi skenario yang aktif → reset
    if (activeScenario === key) {
      keluhanRef.current = { utama: "", tambahan: "" };
      setActiveScenario(null);
      setKeluhanUtama("");
      setKeluhanTambahan("");
      setVitals({ gcs: "", td: "", nadi: "", napas: "", suhu: "", spo2: "", map: "" });
      setGhostVisible(true);
      setWords([]);
      setHeaderText("SENTRA / PUSKESMAS KEDIRI // RM-BARU // SENAUTO ENGINE: IDLE");
      setHeaderColor("var(--text-muted)");
      return;
    }
    const s = AUTOGEN_SCENARIOS[key];
    keluhanRef.current = { utama: s.keluhan_utama, tambahan: s.keluhan_tambahan };
    setVitals({ gcs: "", td: "", nadi: "", napas: "", suhu: "", spo2: "", map: "" });
    setKeluhanUtama(s.keluhan_utama);
    setKeluhanTambahan(s.keluhan_tambahan);
    setActiveScenario(key);
    setGhostVisible(false);
    setWords([]);
    setHeaderText(`SENTRA // RM-BARU // AUTOGEN: SKENARIO ${s.label} DIMUAT — TEKAN AUTO TTV`);
    setHeaderColor("var(--c-asesmen)");
  }

  const labItems = [
    { name: "Hematologi Lengkap", status: "BELUM DIORDER" },
    { name: "C-Reactive Protein (CRP)", status: "BELUM DIORDER" },
    { name: "Foto Thorax AP/PA", status: "BELUM DIORDER" },
  ];

  const isCritical = (val: string, key: string) => {
    const n = parseFloat(val);
    if (isNaN(n)) return false;
    if (key === "suhu" && n >= 38.0) return true;
    if (key === "spo2" && n < 95) return true;
    if (key === "nadi" && (n > 100 || n < 60)) return true;
    return false;
  };

  const vitalFields: { key: keyof typeof vitals; label: string; unit: string }[] = [
    { key: "gcs", label: "GCS", unit: "/15" },
    { key: "td", label: "Tekanan Darah", unit: "mmHg" },
    { key: "nadi", label: "Nadi", unit: "bpm" },
    { key: "napas", label: "Napas", unit: "x/m" },
    { key: "suhu", label: "Suhu", unit: "°C" },
    { key: "spo2", label: "SpO2", unit: "%" },
    { key: "map", label: "MAP", unit: "mmHg" },
  ];

  const examFields: { key: keyof typeof exam; label: string }[] = [
    { key: "kepala", label: "Kepala & Leher" },
    { key: "dada", label: "Dada (Cor & Pulmo)" },
    { key: "perut", label: "Perut (Abdomen)" },
    { key: "ekstremitas", label: "Ekstremitas" },
    { key: "kulit", label: "Kulit" },
    { key: "genitalia", label: "Genitalia" },
  ];

  const filledVitals = Object.values(vitals).filter(Boolean).length;
  const filledExam = Object.values(exam).filter(Boolean).length;
  const progress = Math.round(
    ((!!keluhanUtama ? 1 : 0) + (!!keluhanTambahan ? 0.5 : 0) + (filledVitals / 7) + (filledExam / 6)) / 2.5 * 100
  );

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
      <div className="architecture-grid">

        {/* Meta header */}
        <div className="meta-header" style={{ color: headerColor, display: "flex", alignItems: "center", gap: 16 }}>
          {headerText}
          <span style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 13,
            color: "var(--c-asesmen)",
            border: "1px solid var(--c-asesmen)",
            padding: "1px 10px",
            borderRadius: 2,
            animation: "smoothBlink 2s infinite",
            background: "rgba(212,122,87,0.05)",
            letterSpacing: "0.05em"
          }}>
            ✧ Synthesia Engine
          </span>
        </div>

        {/* ─── Left: Clinical Stream ─── */}
        <div className="clinical-stream">
          <div className="stream-line" />

          {/* Patient Profile Context Bar */}
          <div style={{ display: "flex", gap: 24, marginBottom: 32, padding: "12px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--line-base)", borderRadius: 4, alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-geist-mono)" }}>UMUR:</span>
              <input 
                type="number" 
                value={patientAge} 
                onChange={(e) => setPatientAge(parseInt(e.target.value) || 0)}
                style={{ background: "transparent", border: "none", borderBottom: "1px dashed var(--line-base)", color: "var(--text-main)", width: "40px", fontSize: 14, outline: "none", textAlign: "center" }}
              />
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>thn</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-geist-mono)" }}>GENDER:</span>
              <div style={{ display: "flex", gap: 4 }}>
                {(["L", "P"] as const).map(g => (
                  <button 
                    key={g} 
                    onClick={() => setPatientGender(g)}
                    style={{ 
                      background: patientGender === g ? "var(--c-asesmen)" : "transparent",
                      border: `1px solid ${patientGender === g ? "var(--c-asesmen)" : "var(--line-base)"}`,
                      color: patientGender === g ? "white" : "var(--text-muted)",
                      fontSize: 10, padding: "2px 8px", borderRadius: 2, cursor: "pointer"
                    }}
                  >
                    {g === "L" ? "Laki-laki" : "Perempuan"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 01. Anamnesa */}
          <div className="stream-section">
            <div className="section-title">01. Anamnesa</div>
            <div className="blueprint-wrapper">
              <span className="data-label">Keluhan Utama</span>
              <div className="patient-narrative" style={{ marginBottom: 24, position: "relative" }}>
                <span className="input-draft" style={{ borderBottomColor: draftBorderColor, display: "block" }}>
                  {words.length > 0 ? (
                    words.map((word, i) => (
                      <span key={i} className="blur-word" style={{ animationDelay: `${i * 80}ms` }}>{word}{" "}</span>
                    ))
                  ) : (
                    <textarea
                      value={keluhanUtama}
                      onChange={(e) => {
                        keluhanRef.current.utama = e.target.value;
                        setKeluhanUtama(e.target.value);
                        e.target.style.height = "auto";
                        e.target.style.height = e.target.scrollHeight + "px";
                      }}
                      onInput={(e) => {
                        const t = e.currentTarget;
                        t.style.height = "auto";
                        t.style.height = t.scrollHeight + "px";
                      }}
                      ref={(el) => {
                        if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }
                      }}
                      placeholder="ketik keluhan..."
                      rows={1}
                      style={{
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        resize: "none",
                        overflow: "hidden",
                        fontFamily: "var(--font-geist-sans), sans-serif",
                        fontSize: "inherit",
                        fontWeight: 400,
                        lineHeight: "inherit",
                        color: keluhanUtama ? "var(--text-main)" : "var(--text-muted)",
                        width: "100%",
                        padding: 0,
                        display: "block",
                      }}
                    />
                  )}
                </span>
                
                {/* Floating SenAuto Trigger */}
                {keluhanUtama.trim() && !isTyping && (
                  <div 
                    onClick={handleSenAutoClick} 
                    style={{ 
                      position: "absolute",
                      right: 0,
                      bottom: -18,
                      background: "rgba(212,122,87,0.08)", 
                      border: "1px solid var(--c-asesmen)", 
                      color: "var(--c-asesmen)", 
                      fontFamily: "var(--font-geist-mono), monospace", 
                      fontSize: 9, 
                      padding: "2px 10px", 
                      borderRadius: 4, 
                      cursor: "pointer",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      zIndex: 10,
                      transition: "all 0.2s ease",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.2)"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--c-asesmen)";
                      e.currentTarget.style.color = "white";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(212,122,87,0.08)";
                      e.currentTarget.style.color = "var(--c-asesmen)";
                    }}
                  >
                    ✧ AUTO SENTRA
                  </div>
                )}
              </div>
              <span style={{ color: "var(--text-muted)", fontStyle: "italic", fontSize: 13, marginTop: 4, display: "block" }}>
                {keluhanUtama ? "— durasi belum diidentifikasi" : "..."}
              </span>
              
              <span className="data-label" style={{ display: "block", marginTop: 24 }}>Keluhan Tambahan</span>
              <div className="patient-narrative">
                <input
                  type="text"
                  value={keluhanTambahan}
                  onChange={(e) => { keluhanRef.current.tambahan = e.target.value; setKeluhanTambahan(e.target.value); }}
                  placeholder="keluhan penyerta, gejala sistemik..."
                  style={{
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px dashed var(--line-base)",
                    outline: "none",
                    fontFamily: "var(--font-geist-sans), sans-serif",
                    fontSize: "inherit",
                    fontWeight: 300,
                    color: keluhanTambahan ? "var(--text-main)" : "var(--text-muted)",
                    width: "100%",
                    paddingBottom: 4,
                  }}
                />
              </div>
            </div>
          </div>

          {/* 02. Riwayat */}
          <div className="stream-section">
            <div className="section-title">02. Riwayat Penyakit &amp; Alergi</div>
            {showEmrLoader && <div className="emr-loader">[SYSTEM: RETRIEVING EMR DATA...]</div>}

            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* RPS */}
              <div className="history-item">
                <div className="history-item-title">Riwayat Penyakit Sekarang (RPS)</div>
                <input
                  type="text"
                  value={riwayat.rps}
                  onChange={e => setRiwayat(p => ({ ...p, rps: e.target.value }))}
                  placeholder="onset, durasi, perjalanan penyakit..."
                  style={{
                    background: "transparent", border: "none",
                    borderBottom: "1px dashed var(--line-base)", outline: "none",
                    fontFamily: "var(--font-geist-sans), sans-serif",
                    fontSize: 15, fontWeight: 300,
                    color: riwayat.rps ? "var(--text-main)" : "var(--text-muted)",
                    fontStyle: riwayat.rps ? "normal" : "italic",
                    width: "100%", paddingBottom: 4, marginTop: 4,
                  }}
                />
              </div>

              {/* RPD — chip selector */}
              <div className="history-item">
                <div className="history-item-title" style={{ marginBottom: 8 }}>
                  Riwayat Penyakit Dahulu (RPD)
                  {rpdSelected.size > 0 && (
                    <span style={{ marginLeft: 8, fontFamily: "var(--font-geist-mono), monospace", fontSize: 9, color: "var(--c-asesmen)", letterSpacing: "0.08em" }}>
                      {rpdSelected.size} dipilih
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {RPD_OPTIONS.map(opt => {
                    const active = rpdSelected.has(opt);
                    return (
                      <button key={opt} onClick={() => toggleRpd(opt)} style={{
                        fontFamily: "var(--font-geist-sans), sans-serif",
                        fontSize: 12, padding: "4px 10px", cursor: "pointer",
                        border: `1px solid ${active ? "var(--c-asesmen)" : "var(--line-base)"}`,
                        background: active ? "rgba(212,122,87,0.12)" : "transparent",
                        color: active ? "var(--c-asesmen)" : "var(--text-muted)",
                        borderRadius: 2, transition: "all 0.15s",
                      }}>
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* RPK */}
              <div className="history-item">
                <div className="history-item-title">Riwayat Penyakit Keluarga (RPK)</div>
                <input
                  type="text"
                  value={riwayat.rpk}
                  onChange={e => setRiwayat(p => ({ ...p, rpk: e.target.value }))}
                  placeholder="DM, jantung, kanker, HT dalam keluarga..."
                  style={{
                    background: "transparent", border: "none",
                    borderBottom: "1px dashed var(--line-base)", outline: "none",
                    fontFamily: "var(--font-geist-sans), sans-serif",
                    fontSize: 15, fontWeight: 300,
                    color: riwayat.rpk ? "var(--text-main)" : "var(--text-muted)",
                    fontStyle: riwayat.rpk ? "normal" : "italic",
                    width: "100%", paddingBottom: 4, marginTop: 4,
                  }}
                />
              </div>

              {/* Alergi — chip selector */}
              <div className="history-item">
                <div className="history-item-title" style={{ marginBottom: 8 }}>
                  Alergi Tercatat
                  {alergiSelected.size > 0 && (
                    <span style={{ marginLeft: 8, fontFamily: "var(--font-geist-mono), monospace", fontSize: 9, color: "var(--c-critical)", letterSpacing: "0.08em" }}>
                      ⚠ {alergiSelected.size} alergi
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {ALERGI_OPTIONS.map(opt => {
                    const active = alergiSelected.has(opt);
                    return (
                      <button key={opt} onClick={() => toggleAlergi(opt)} style={{
                        fontFamily: "var(--font-geist-sans), sans-serif",
                        fontSize: 12, padding: "4px 10px", cursor: "pointer",
                        border: `1px solid ${active ? "var(--c-critical)" : "var(--line-base)"}`,
                        background: active ? "rgba(220,53,69,0.1)" : "transparent",
                        color: active ? "var(--c-critical)" : "var(--text-muted)",
                        borderRadius: 2, transition: "all 0.15s",
                      }}>
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>

          {/* 03. Tanda Vital */}
          <div className="stream-section">
            <div className="section-title">03. Tanda Vital &amp; Objektif</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 16, marginTop: -16 }}>
              <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {/* Auto TTV dari keluhan */}
                <button
                  onClick={() => inferTTV()}
                  disabled={!keluhanUtama.trim()}
                  title="Generate TTV berdasarkan keluhan"
                  style={{
                    fontFamily: "var(--font-geist-mono), monospace", fontSize: 9,
                    letterSpacing: "0.1em", padding: "3px 8px", background: "transparent",
                    border: "1px solid var(--c-asesmen)", color: "var(--c-asesmen)",
                    cursor: keluhanUtama.trim() ? "pointer" : "not-allowed",
                    opacity: keluhanUtama.trim() ? 1 : 0.35, textTransform: "uppercase",
                  }}
                >
                  ✧ AUTO TTV
                </button>
                {/* Separator */}
                <span style={{ color: "var(--line-base)", fontSize: 10 }}>|</span>
                {/* Skenario presets */}
                {(["hipertensi", "hiperglikemi", "hipoglikemi"] as const).map((key) => (
                  <button
                    key={key}
                    onClick={() => autoFillScenario(key)}
                    style={{
                      fontFamily: "var(--font-geist-mono), monospace", fontSize: 9,
                      letterSpacing: "0.1em", padding: "3px 8px",
                      background: activeScenario === key ? "rgba(212,122,87,0.12)" : "transparent",
                      border: `1px solid ${activeScenario === key ? "var(--c-asesmen)" : "var(--line-base)"}`,
                      color: activeScenario === key ? "var(--c-asesmen)" : "var(--text-muted)",
                      cursor: "pointer", textTransform: "uppercase",
                      transition: "all 0.15s",
                    }}
                  >
                    {AUTOGEN_SCENARIOS[key].label}
                  </button>
                ))}
              </span>
            </div>
            <div className="vitals-matrix">
              {vitalFields.map(({ key, label, unit }) => (
                <div key={key} className={`vital-item${isCritical(vitals[key], key) ? " v-critical" : ""}`}>
                  <span className="v-label">{label}</span>
                  <span className="v-value" style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                    <input
                      type="text"
                      value={vitals[key]}
                      onChange={(e) => setVitals((p) => ({ ...p, [key]: e.target.value }))}
                      placeholder="—"
                      style={{
                        background: "transparent",
                        border: "none",
                        borderBottom: vitals[key] ? "none" : "1px dashed var(--line-base)",
                        outline: "none",
                        fontFamily: "var(--font-geist-mono), monospace",
                        fontSize: 28,
                        fontWeight: 300,
                        color: isCritical(vitals[key], key) ? "var(--c-critical)" : vitals[key] ? "var(--text-main)" : "var(--text-muted)",
                        width: vitals[key] ? `${vitals[key].length + 1}ch` : "3ch",
                        minWidth: "2.5ch",
                        lineHeight: 1,
                        letterSpacing: "-1px",
                        padding: 0,
                      }}
                    />
                    <span className="v-unit">{unit}</span>
                  </span>
                </div>
              ))}

              {/* Gula Darah — field terpisah dengan tipe selector */}
              <div className="vital-item" style={{ borderTop: "1px dashed var(--line-base)", paddingTop: 12, marginTop: 4 }}>
                <span className="v-label">Gula Darah</span>
                <span className="v-value" style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <input
                    type="text"
                    value={gulaDarah.nilai}
                    onChange={e => setGulaDarah(p => ({ ...p, nilai: e.target.value }))}
                    placeholder="—"
                    style={{
                      background: "transparent", border: "none",
                      borderBottom: gulaDarah.nilai ? "none" : "1px dashed var(--line-base)",
                      outline: "none",
                      fontFamily: "var(--font-geist-mono), monospace",
                      fontSize: 28, fontWeight: 300,
                      color: gulaDarah.nilai
                        ? (parseFloat(gulaDarah.nilai) < 70 || parseFloat(gulaDarah.nilai) > 200 ? "var(--c-critical)" : "var(--text-main)")
                        : "var(--text-muted)",
                      width: gulaDarah.nilai ? `${gulaDarah.nilai.length + 1}ch` : "3ch",
                      minWidth: "2.5ch", lineHeight: 1, letterSpacing: "-1px", padding: 0,
                    }}
                  />
                  <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 9, color: "var(--text-muted)" }}>mg/dL</span>
                    <span style={{ display: "flex", gap: 3 }}>
                      {(["GDS", "GDP", "2JPP"] as const).map(t => (
                        <button key={t} onClick={() => setGulaDarah(p => ({ ...p, tipe: t }))} style={{
                          fontFamily: "var(--font-geist-mono), monospace", fontSize: 8,
                          padding: "1px 4px", cursor: "pointer",
                          border: `1px solid ${gulaDarah.tipe === t ? "var(--c-asesmen)" : "var(--line-base)"}`,
                          background: gulaDarah.tipe === t ? "rgba(212,122,87,0.12)" : "transparent",
                          color: gulaDarah.tipe === t ? "var(--c-asesmen)" : "var(--text-muted)",
                        }}>{t}</button>
                      ))}
                    </span>
                  </span>
                </span>
              </div>
            </div>

            {/* Gate 2/3/4 Screening Alerts — sama persis visual treatment Assist */}
            {screeningAlerts.length > 0 && (
              <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                {screeningAlerts.map(alert => {
                  const isCrit = alert.severity === "critical";
                  const isHigh = alert.severity === "high";
                  return (
                    <div key={alert.id} style={{
                      padding: "12px 16px",
                      borderRadius: "8px",
                      border: `1px solid ${isCrit ? "#ef4444" : isHigh ? "#f97316" : "#eab308"}`,
                      background: isCrit
                        ? "linear-gradient(135deg, rgba(220,38,38,0.15), rgba(153,27,27,0.15))"
                        : isHigh ? "rgba(249,115,22,0.10)" : "rgba(234,179,8,0.08)",
                      animation: isCrit ? "pulse-border 2s infinite" : undefined,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                        <span style={{ fontSize: "16px" }}>{isCrit ? "🚑" : isHigh ? "🚨" : "⚠️"}</span>
                        {isCrit && (
                          <span style={{
                            background: "#ef4444", color: "white",
                            fontSize: "9px", fontWeight: 700, letterSpacing: "0.5px",
                            padding: "2px 6px", borderRadius: "3px",
                          }}>EMERGENCY</span>
                        )}
                        <span style={{
                          fontFamily: "var(--font-geist-mono), monospace",
                          fontWeight: 700, fontSize: "11px",
                          color: isCrit ? "#ef4444" : isHigh ? "#f97316" : "#eab308",
                        }}>{alert.title}</span>
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "6px" }}>{alert.reasoning}</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        {alert.recommendations.slice(0, 3).map((r, i) => (
                          <div key={i} style={{ fontSize: "10px", color: "var(--text-base)" }}>⚡ {r}</div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="lab-trigger-container">
              <button className={`lab-ghost-btn${labOpen ? " open" : ""}`} onClick={() => setLabOpen(!labOpen)}>
                {labOpen ? "✧ Usulan Pemeriksaan Lab — Pilih:" : "✧ Usulan Pemeriksaan Lab"}
              </button>
              <div className={`lab-expansion${labOpen ? " open" : ""}`}>
                {labItems.map((item, i) => (
                  <div key={i} className={`lab-item${labSelected[i] ? " selected" : ""}`} onClick={() => toggleLab(i)}>
                    <div className="lab-item-left">{item.name}</div>
                    <span className="lab-status">{item.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Clinical Trajectory Panel */}
          {trajectoryOpen && vitals.td && (
            <TrajectoryPanel
              vitals={{
                sbp: parseInt(vitals.td.split("/")[0]) || 0,
                dbp: parseInt(vitals.td.split("/")[1]) || 0,
                hr: parseFloat(vitals.nadi) || 0,
                rr: parseFloat(vitals.napas) || 0,
                temp: parseFloat(vitals.suhu) || 0,
                glucose: parseFloat(gulaDarah.nilai) || 0,
              }}
              keluhanUtama={keluhanUtama}
              rpdSelected={rpdSelected}
              screeningAlerts={screeningAlerts}
              onClose={toggleTrajectory}
            />
          )}

          {/* 04. Pemeriksaan Fisik */}
          <div className="stream-section">
            <button
              onClick={() => setExamOpen(o => !o)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", background: "transparent", border: "none", cursor: "pointer",
                padding: 0,
              }}
            >
              <span className="section-title" style={{ margin: 0 }}>04. Pemeriksaan Fisik Head-to-Toe</span>
              <span style={{
                fontFamily: "var(--font-geist-mono), monospace", fontSize: 9,
                letterSpacing: "0.12em", color: "var(--text-muted)",
              }}>
                {examOpen ? "[ TUTUP ▲ ]" : "[ BUKA ▼ ]"}
              </span>
            </button>
            {examOpen && (
              <div className="exam-list" style={{ marginTop: 12 }}>
                {examFields.map(({ key, label }) => (
                  <div key={key} className="exam-row">
                    <span className="exam-organ">{label}</span>
                    <input
                      type="text"
                      value={exam[key]}
                      onChange={(e) => setExam((p) => ({ ...p, [key]: e.target.value }))}
                      placeholder="ketik hasil pemeriksaan..."
                      className="exam-result"
                      style={{
                        background: "transparent", border: "none",
                        borderBottom: "1px dashed var(--line-base)", outline: "none",
                        color: exam[key] ? "var(--text-main)" : "var(--text-muted)",
                        width: "100%", paddingBottom: 4,
                        fontStyle: exam[key] ? "normal" : "italic",
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => void runCDSS()}
            disabled={cdssLoading || !keluhanUtama.trim()}
            style={{
              marginTop: 8,
              padding: "10px 20px",
              background: cdssLoading ? "var(--line-base)" : "var(--c-asesmen)",
              border: "none",
              color: "#fff",
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 10,
              letterSpacing: "0.12em",
              cursor: cdssLoading || !keluhanUtama.trim() ? "not-allowed" : "pointer",
              opacity: !keluhanUtama.trim() ? 0.4 : 1,
            }}
          >
            {cdssLoading ? "⏳ MEMPROSES CDSS..." : "▶ JALANKAN CDSS ENGINE"}
          </button>

          <input
            type="text"
            className="omni-input"
            placeholder="Ketik kesimpulan asesmen atau ketik '/' untuk perintah..."
          />
        </div>

        {/* ─── Right: Extraction Sidebar ─── */}
        <div className="entity-sidebar">
          <div className="extraction-block">
            <div className="extraction-header" style={{ color: "var(--c-asesmen)" }}>
              <span>Audrey Synthesia Algorithm</span>
              <span style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 11, color: "var(--c-asesmen)", animation: "smoothBlink 2s infinite" }}>
                LISTENING...
              </span>
            </div>
            <div className="extracted-list">
              {[
                { label: "Keluhan Utama", meta: anamnesaEntities.utama || "PENDING" },
                { label: "Onset / Durasi", meta: anamnesaEntities.onset || "PENDING" },
                { label: "Faktor Pemberatan", meta: anamnesaEntities.faktor || "PENDING" },
              ].map((item, i) => (
                <div key={i} className={`entity-tag-item${anamnesaVisible[i] ? " visible" : ""}`}
                  style={anamnesaVisible[i] ? {} : { opacity: 0.2, transform: "none" }}>
                  <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>{item.label}</span>
                  <span className="tag-meta" style={{ 
                    color: item.meta !== "PENDING" ? "var(--c-asesmen)" : "var(--text-muted)",
                    opacity: item.meta !== "PENDING" ? 1 : 0.5 
                  }}>{item.meta}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="extraction-block">
            <div className="extraction-header" style={{ color: "var(--text-muted)", borderBottomColor: "var(--line-base)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="ai-pulse-dot" style={{ background: "var(--text-muted)", boxShadow: "none", animation: "none", opacity: 0.3 }} />
                VITALS &amp; EMR ANOMALY
              </span>
            </div>
            <div className="extracted-list">
              {[
                { label: "Tekanan Darah", value: vitals.td ? `${vitals.td} mmHg` : null },
                { label: "Suhu Tubuh",    value: vitals.suhu ? `${vitals.suhu} °C` : null },
                { label: "SpO2",          value: vitals.spo2 ? `${vitals.spo2}%` : null },
                { label: "Nadi",          value: vitals.nadi ? `${vitals.nadi} bpm` : null },
                { label: `Gula Darah (${gulaDarah.tipe})`, value: gulaDarah.nilai ? `${gulaDarah.nilai} mg/dL` : null },
                { label: "Status Alergi", value: alergiSelected.size > 0 ? Array.from(alergiSelected).join(", ") : null },
                { label: "Komorbid",      value: rpdSelected.size > 0 ? Array.from(rpdSelected).join(", ") : null },
              ].map((item, i) => (
                <div key={i} className="entity-tag-item" style={{ opacity: item.value ? 1 : 0.2, transform: "none" }}>
                  <span style={{ color: item.value ? "var(--text-main)" : "var(--text-muted)", fontStyle: item.value ? "normal" : "italic" }}>{item.label}</span>
                  <span className="tag-meta" style={{ opacity: item.value ? 1 : 0.4, color: item.value ? "var(--c-asesmen)" : undefined }}>
                    {item.value ?? "PENDING"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* CDSS Panel — Iskandar Engine V1 */}
          {(cdssLoading || cdssResult || cdssError) && (
            <div className="extraction-block">
              {/* Header */}
              <div className="extraction-header" style={{ color: "var(--c-asesmen)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="ai-pulse-dot" />
                  ISKANDAR ENGINE V1
                </span>
                {cdssResult && (
                  <span style={{ fontSize: 9, letterSpacing: "0.1em", color: "var(--text-muted)" }}>
                    {cdssResult.processing_time_ms}ms · {cdssResult.source.toUpperCase()} · {cdssResult.model_version}
                  </span>
                )}
              </div>

              {cdssLoading && (
                <div style={{ padding: "12px 0", fontFamily: "var(--font-geist-mono), monospace", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em", animation: "smoothBlink 1s infinite" }}>
                  MENJALANKAN ISKANDAR DIAGNOSIS ENGINE V1...
                </div>
              )}

              {cdssError && (
                <div style={{ padding: "8px 0", fontSize: 11, color: "var(--c-critical)" }}>{cdssError}</div>
              )}

              {cdssResult && (
                <div className="extracted-list">
                  {/* Red Flags */}
                  {cdssResult.red_flags.map((rf, i) => (
                    <div key={i} style={{
                      padding: "8px 10px", marginBottom: 6,
                      border: `1px solid ${rf.severity === "emergency" ? "var(--c-critical)" : "#E8A838"}`,
                      background: rf.severity === "emergency" ? "rgba(220,53,69,0.08)" : "rgba(232,168,56,0.08)",
                    }}>
                      <div style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 9, letterSpacing: "0.1em", color: rf.severity === "emergency" ? "var(--c-critical)" : "#E8A838", marginBottom: 4 }}>
                        ⚠ {rf.severity.toUpperCase()} — {rf.condition}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{rf.action}</div>
                    </div>
                  ))}

                  {/* Traffic Light alert (dari alerts[]) */}
                  {cdssResult.alerts.filter(a => a.type === "red_flag" || a.type === "vital_sign").slice(0, 1).map(a => (
                    <div key={a.id} style={{ padding: "6px 0", marginBottom: 8, fontFamily: "var(--font-geist-mono), monospace", fontSize: 9, letterSpacing: "0.08em" }}>
                      <span style={{ color: a.severity === "high" || a.severity === "emergency" ? "var(--c-critical)" : "#E8A838", marginRight: 6 }}>
                        ● {a.severity.toUpperCase()}
                      </span>
                      <span style={{ color: "var(--text-muted)" }}>{a.title} — {a.message}</span>
                    </div>
                  ))}

                  {/* Validation summary */}
                  {cdssResult.validation_summary.warnings.length > 0 && (
                    <div style={{ padding: "4px 0 8px", fontSize: 9, color: "var(--text-muted)", fontFamily: "var(--font-geist-mono), monospace", letterSpacing: "0.06em" }}>
                      {cdssResult.validation_summary.total_validated}/{cdssResult.validation_summary.total_raw} tervalidasi
                      {cdssResult.validation_summary.unverified_codes.length > 0 && ` · ${cdssResult.validation_summary.unverified_codes.length} kode unverified`}
                    </div>
                  )}

                  {/* Suggestions */}
                  {cdssResult.suggestions.slice(0, 3).map((s) => (
                    <div key={s.rank} className="entity-tag-item visible" style={{ flexDirection: "column", alignItems: "flex-start", gap: 4, padding: "8px 0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                        <span style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 10, color: "var(--c-asesmen)" }}>
                          #{s.rank} {s.icd10_code}
                          {s.rag_verified && <span style={{ marginLeft: 4, opacity: 0.6 }}>✓</span>}
                        </span>
                        <span className="tag-meta">{Math.round(s.confidence * 100)}%</span>
                      </div>
                      <div style={{ fontFamily: "var(--font-geist-sans), sans-serif", fontSize: 13, color: "var(--text-main)", fontWeight: 500 }}>{s.diagnosis_name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>{s.reasoning}</div>
                      {s.recommended_actions && s.recommended_actions.length > 0 && (
                        <div style={{ fontSize: 10, color: "var(--text-muted)", fontStyle: "italic" }}>
                          → {s.recommended_actions[0]}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {showInsight && (
            <div
              className="extraction-block"
              style={{
                opacity: trajectoryActive ? 1 : 0,
                transform: trajectoryActive ? "translateY(0)" : "translateY(10px)",
                transition: "all 0.8s ease",
                display: "flex",
              }}
            >
              <div className="extraction-header" style={{ color: "var(--text-muted)", borderBottomColor: "var(--line-base)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="ai-pulse-dot" style={{ background: "var(--text-muted)", animation: "none", opacity: 0.3 }} />
                  AI TRAJECTORY INSIGHT
                </span>
              </div>
              <div className="insight-text-sidebar" style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                Belum ada riwayat kunjungan sebelumnya. Trajektori akan tersedia setelah data terkumpul.
              </div>
            </div>
          )}
        </div>
      </div>
      <EMRTransferPanel />
    </div>
  );
}
