"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Clock, Video, Phone, MessageSquare, User } from "lucide-react";

import type { ConsultationType, CreateAppointmentInput } from "@/types/telemedicine.types";

/* ── Design tokens ── */
const L = {
  bgPanel:   "#141414",
  border:    "rgba(255,255,255,0.08)",
  text:      "#d4d4d4",
  muted:     "#666666",
  accent:    "#E67E22",
  mono:      "var(--font-geist-mono), 'Fira Code', monospace",
  sans:      "var(--font-geist-sans), sans-serif",
};

interface DoctorOption { id: string; name: string; spesialisasi: string; }
interface DoctorSlot { date: string; startTime: string; endTime: string; isAvailable: boolean; }
interface AppointmentBookingProps { onSuccess: (appointmentId: string) => void; onCancel: () => void; }

const CONSULTATION_TYPES: Array<{ value: ConsultationType; label: string; icon: React.ReactNode }> = [
  { value: "VIDEO", label: "Video",    icon: <Video size={13} /> },
  { value: "AUDIO", label: "Telepon",  icon: <Phone size={13} /> },
  { value: "CHAT",  label: "Chat",     icon: <MessageSquare size={13} /> },
];

const DOCTORS: DoctorOption[] = [
  { id: "ferdi", name: "dr. Ferdi Iskandar", spesialisasi: "Dokter Umum" },
];

function getNext7Days(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}

/* ── Shared field components ── */
const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontFamily: L.mono, fontSize: 10, color: L.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
    {children}
  </div>
);

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  background: "rgba(255,255,255,0.04)",
  border: `1px solid ${L.border}`,
  borderRadius: 2,
  padding: "8px 10px",
  color: L.text,
  fontFamily: L.mono, fontSize: 12,
  outline: "none",
};

export function AppointmentBooking({ onSuccess, onCancel }: AppointmentBookingProps): React.JSX.Element {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [slots, setSlots] = useState<DoctorSlot[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(getNext7Days()[0]);
  const [form, setForm] = useState<Partial<CreateAppointmentInput & { patientName: string; doctorName: string; patientPhone: string }>>({
    consultationType: "VIDEO",
    durationMinutes: 15,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const days = getNext7Days();

  useEffect(() => {
    if (!form.doctorId || !selectedDate) return;
    setIsLoading(true);
    fetch(`/api/telemedicine/slots?doctorId=${form.doctorId}&date=${selectedDate}`)
      .then((r) => r.json())
      .then((d: { data?: DoctorSlot[] }) => setSlots(d.data ?? []))
      .catch(() => setSlots([]))
      .finally(() => setIsLoading(false));
  }, [form.doctorId, selectedDate]);

  const handleSubmit = useCallback(async () => {
    if (!form.patientId || !form.doctorId || !form.scheduledAt) {
      setError("Mohon lengkapi semua data"); return;
    }
    setIsSaving(true); setError(null);
    try {
      const res = await fetch("/api/telemedicine/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { data?: { id: string }; message?: string };
      if (!res.ok) throw new Error(data.message ?? "Gagal membuat appointment");
      onSuccess(data.data?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setIsSaving(false);
    }
  }, [form, onSuccess]);

  const STEPS = ["Dokter & Pasien", "Jadwal", "Konfirmasi"];
  const canNext1 = !!(form.doctorId && form.patientId);
  const canNext2 = !!form.scheduledAt;

  return (
    <div style={{ fontFamily: L.sans }}>

      {/* Step indicator */}
      <div style={{
        display: "flex", alignItems: "center", gap: 0,
        padding: "10px 18px",
        borderBottom: `1px solid ${L.border}`,
      }}>
        {STEPS.map((label, i) => {
          const num = i + 1;
          const isActive = step === num;
          const isDone = step > num;
          return (
            <div key={num} style={{ display: "flex", alignItems: "center" }}>
              <span style={{
                fontFamily: L.mono, fontSize: 10, letterSpacing: "0.08em",
                color: isDone ? L.accent : isActive ? L.accent : L.muted,
              }}>
                {isDone ? "✓" : `0${num}`} {label.toUpperCase()}
              </span>
              {i < 2 && <span style={{ fontFamily: L.mono, color: L.border, margin: "0 10px", fontSize: 10 }}>›</span>}
            </div>
          );
        })}
      </div>

      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── STEP 1 ── */}
        {step === 1 && (
          <>
            <div>
              <FieldLabel>Dokter *</FieldLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {DOCTORS.map((doc) => {
                  const sel = form.doctorId === doc.id;
                  return (
                    <button
                      key={doc.id}
                      onClick={() => setForm((p) => ({ ...p, doctorId: doc.id, doctorName: doc.name }))}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "9px 12px",
                        background: sel ? "rgba(230,126,34,0.1)" : "transparent",
                        border: `1px solid ${sel ? L.accent : L.border}`,
                        borderRadius: 2,
                        cursor: "pointer", textAlign: "left",
                      }}
                    >
                      <User size={14} style={{ color: sel ? L.accent : L.muted, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontFamily: L.sans, fontSize: 13, color: sel ? L.accent : L.text }}>{doc.name}</div>
                        <div style={{ fontFamily: L.mono, fontSize: 10, color: L.muted, marginTop: 1 }}>{doc.spesialisasi.toUpperCase()}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <FieldLabel>Nama / No. RM Pasien *</FieldLabel>
              <input
                placeholder="nama lengkap atau nomor rekam medis..."
                value={form.patientId ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, patientId: e.target.value, patientName: e.target.value }))}
                style={inputStyle}
              />
            </div>

            <div>
              <FieldLabel>No. HP Pasien (WhatsApp)</FieldLabel>
              <input
                placeholder="08xx atau +628xx..."
                value={form.patientPhone ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, patientPhone: e.target.value }))}
                style={inputStyle}
                type="tel"
              />
              <div style={{ fontFamily: L.mono, fontSize: 10, color: L.muted, marginTop: 5 }}>
                pasien akan menerima link join via whatsapp
              </div>
            </div>

            <div>
              <FieldLabel>Tipe Konsultasi</FieldLabel>
              <div style={{ display: "flex", gap: 6 }}>
                {CONSULTATION_TYPES.map((opt) => {
                  const sel = form.consultationType === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setForm((p) => ({ ...p, consultationType: opt.value }))}
                      style={{
                        flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        padding: "7px 0",
                        background: sel ? "rgba(230,126,34,0.1)" : "transparent",
                        border: `1px solid ${sel ? L.accent : L.border}`,
                        borderRadius: 2,
                        color: sel ? L.accent : L.muted,
                        fontFamily: L.mono, fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      {opt.icon} {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ── STEP 2 ── */}
        {step === 2 && (
          <>
            <div>
              <FieldLabel>Tanggal</FieldLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {days.map((d) => {
                  const dateObj = new Date(d + "T00:00:00");
                  const isSel = selectedDate === d;
                  return (
                    <button key={d} onClick={() => setSelectedDate(d)} style={{
                      padding: "5px 10px",
                      background: isSel ? "rgba(230,126,34,0.1)" : "transparent",
                      border: `1px solid ${isSel ? L.accent : L.border}`,
                      borderRadius: 2,
                      color: isSel ? L.accent : L.muted,
                      fontFamily: L.mono, fontSize: 10, letterSpacing: "0.05em",
                      cursor: "pointer",
                    }}>
                      {dateObj.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" }).toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </div>

            {isLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "20px 0" }}>
                <div style={{ width: 22, height: 22, border: `2px solid ${L.accent}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
              </div>
            ) : slots.length === 0 ? (
              <div style={{ fontFamily: L.mono, fontSize: 11, color: L.muted, textAlign: "center", padding: "20px 0" }}>
                tidak ada slot tersedia
              </div>
            ) : (
              <div>
                <FieldLabel>Jam</FieldLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {slots.map((slot) => {
                    const slotIso = `${selectedDate}T${slot.startTime}:00+07:00`;
                    const isSel = form.scheduledAt === slotIso;
                    return (
                      <button
                        key={slot.startTime}
                        disabled={!slot.isAvailable}
                        onClick={() => setForm((p) => ({ ...p, scheduledAt: slotIso }))}
                        style={{
                          display: "flex", alignItems: "center", gap: 4,
                          padding: "5px 10px",
                          background: !slot.isAvailable ? "transparent" : isSel ? "rgba(230,126,34,0.1)" : "transparent",
                          border: `1px solid ${!slot.isAvailable ? "rgba(255,255,255,0.04)" : isSel ? L.accent : L.border}`,
                          borderRadius: 2,
                          color: !slot.isAvailable ? "rgba(255,255,255,0.15)" : isSel ? L.accent : L.muted,
                          fontFamily: L.mono, fontSize: 11,
                          cursor: slot.isAvailable ? "pointer" : "not-allowed",
                        }}
                      >
                        <Clock size={10} />{slot.startTime}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── STEP 3 ── */}
        {step === 3 && (
          <>
            <div>
              <FieldLabel>Keluhan Utama</FieldLabel>
              <textarea
                rows={3}
                placeholder="keluhan yang ingin dikonsultasikan..."
                value={form.keluhanUtama ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, keluhanUtama: e.target.value }))}
                style={{ ...inputStyle, resize: "none" }}
              />
            </div>
            <div>
              <FieldLabel>No. SEP BPJS (opsional)</FieldLabel>
              <input
                placeholder="nomor sep peserta bpjs..."
                value={form.bpjsNomorSEP ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, bpjsNomorSEP: e.target.value }))}
                style={inputStyle}
              />
            </div>

            {/* Summary */}
            <div style={{
              background: "rgba(230,126,34,0.06)",
              border: `1px solid rgba(230,126,34,0.2)`,
              borderRadius: 2, padding: "10px 14px",
            }}>
              <div style={{ fontFamily: L.mono, fontSize: 10, color: L.muted, letterSpacing: "0.12em", marginBottom: 8 }}>RINGKASAN</div>
              {[
                ["DOKTER",  form.doctorName ?? form.doctorId ?? "-"],
                ["PASIEN",  form.patientName ?? form.patientId ?? "-"],
                ["JADWAL",  form.scheduledAt ? new Date(form.scheduledAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-"],
                ["DURASI",  `${form.durationMinutes ?? 15} menit`],
                ["TIPE",    form.consultationType ?? "VIDEO"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: 8, padding: "3px 0", borderBottom: `1px solid ${L.border}` }}>
                  <span style={{ fontFamily: L.mono, fontSize: 10, color: L.muted }}>{k}</span>
                  <span style={{ fontFamily: L.mono, fontSize: 11, color: L.text }}>{v}</span>
                </div>
              ))}
            </div>

            {error && (
              <div style={{ fontFamily: L.mono, fontSize: 11, color: "#f87171", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 2, padding: "8px 12px" }}>
                {error}
              </div>
            )}
          </>
        )}

        {/* Navigation */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4, borderTop: `1px solid ${L.border}` }}>
          <button
            onClick={step === 1 ? onCancel : () => setStep((s) => (s - 1) as 1 | 2)}
            style={{ fontFamily: L.mono, fontSize: 11, color: L.muted, background: "none", border: "none", cursor: "pointer", padding: "6px 0" }}
          >
            {step === 1 ? "BATAL" : "← KEMBALI"}
          </button>

          {step < 3 ? (
            <button
              onClick={() => setStep((s) => (s + 1) as 2 | 3)}
              disabled={step === 1 ? !canNext1 : !canNext2}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 16px",
                background: (step === 1 ? !canNext1 : !canNext2) ? "transparent" : "rgba(230,126,34,0.15)",
                border: `1px solid ${(step === 1 ? !canNext1 : !canNext2) ? L.border : L.accent}`,
                borderRadius: 2,
                color: (step === 1 ? !canNext1 : !canNext2) ? L.muted : L.accent,
                fontFamily: L.mono, fontSize: 11,
                cursor: (step === 1 ? !canNext1 : !canNext2) ? "not-allowed" : "pointer",
              }}
            >
              LANJUT →
            </button>
          ) : (
            <button
              onClick={() => void handleSubmit()}
              disabled={isSaving}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 16px",
                background: "rgba(230,126,34,0.15)",
                border: `1px solid ${L.accent}`,
                borderRadius: 2,
                color: L.accent,
                fontFamily: L.mono, fontSize: 11,
                cursor: isSaving ? "not-allowed" : "pointer",
                opacity: isSaving ? 0.6 : 1,
              }}
            >
              {isSaving ? (
                <><div style={{ width: 12, height: 12, border: `2px solid ${L.accent}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} /> MENYIMPAN...</>
              ) : "✓ BUAT APPOINTMENT"}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
