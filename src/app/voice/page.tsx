"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { io, Socket } from "socket.io-client";

type Message = {
  id: number;
  role: "user" | "assistant";
  text: string;
  time: string;
};

type SessionState = "idle" | "connecting" | "ready" | "recording" | "processing" | "speaking" | "error";

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function scheduleChunk(base64: string, ctx: AudioContext, nextStartRef: { t: number }): void {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const samples = bytes.length / 2;
  const float32 = new Float32Array(samples);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples; i++) {
    float32[i] = view.getInt16(i * 2, true) / 32768.0;
  }
  const audioBuf = ctx.createBuffer(1, float32.length, 24000);
  audioBuf.getChannelData(0).set(float32);
  const source = ctx.createBufferSource();
  source.buffer = audioBuf;
  source.connect(ctx.destination);
  const startAt = Math.max(ctx.currentTime + 0.005, nextStartRef.t);
  source.start(startAt);
  nextStartRef.t = startAt + audioBuf.duration;
}

export default function VoicePage() {
  const [messages, setMessages]    = useState<Message[]>([]);
  const [sessionState, setSession] = useState<SessionState>("idle");
  const [error, setError]          = useState("");
  const [liveText, setLiveText]    = useState("");
  const socketRef        = useRef<Socket | null>(null);
  const recordCtxRef     = useRef<AudioContext | null>(null);  // 16kHz — mic capture
  const playbackCtxRef   = useRef<AudioContext | null>(null);  // 24kHz — Audrey playback
  const mediaStreamRef   = useRef<MediaStream | null>(null);
  const workletRef       = useRef<AudioWorkletNode | null>(null);
  const messagesEndRef   = useRef<HTMLDivElement>(null);
  const accTextRef       = useRef("");
  const accUserTextRef   = useRef("");
  const nextStartRef     = useRef<{ t: number }>({ t: 0 });
  const isPttRef         = useRef(false);  // PTT: true saat tombol ditekan

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => { return () => { void disconnect(); }; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const disconnect = useCallback(async () => {
    workletRef.current?.disconnect();
    workletRef.current = null;
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    mediaStreamRef.current = null;
    socketRef.current?.emit("voice:stop");
    socketRef.current?.disconnect();
    socketRef.current = null;
    if (recordCtxRef.current && recordCtxRef.current.state !== "closed") {
      await recordCtxRef.current.close();
    }
    recordCtxRef.current = null;
    if (playbackCtxRef.current && playbackCtxRef.current.state !== "closed") {
      await playbackCtxRef.current.close();
    }
    playbackCtxRef.current = null;
    nextStartRef.current = { t: 0 };
    accTextRef.current = "";
    accUserTextRef.current = "";
    isPttRef.current = false;
    setSession("idle");
    setLiveText("");
  }, []);

  async function setupMic(socket: Socket) {
    const ctx = recordCtxRef.current!;
    // Matikan semua audio processing browser — bisa distorsi suara dan bikin STT salah baca
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });
    mediaStreamRef.current = stream;

    await ctx.audioWorklet.addModule("/pcm-processor.js");
    const worklet = new AudioWorkletNode(ctx, "pcm-processor");
    workletRef.current = worklet;

    // Kirim actual sample rate AudioContext — bukan hardcode — agar label MIME akurat
    const actualRate = ctx.sampleRate;
    const mimeType = `audio/pcm;rate=${actualRate}`;

    worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      // PTT: hanya kirim audio saat tombol ditekan
      if (!isPttRef.current) return;
      const bytes = new Uint8Array(e.data);
      let binary = "";
      const CHUNK = 8192;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      socket.emit("voice:audio_chunk", { data: btoa(binary), mimeType });
    };

    // Hanya connect ke worklet untuk capture — tidak ke destination (cegah mic loopback)
    const source = ctx.createMediaStreamSource(stream);
    source.connect(worklet);
  }

  const connect = useCallback(async () => {
    setError("");
    setSession("connecting");

    let doctorName = "Dokter";
    try {
      const res = await fetch("/api/auth/session");
      const data = await res.json() as { user?: { displayName?: string } } | null;
      doctorName = data?.user?.displayName ?? "Dokter";
    } catch { /* pakai default */ }

    recordCtxRef.current  = new AudioContext({ sampleRate: 16000 });
    playbackCtxRef.current = new AudioContext({ sampleRate: 24000 });
    const socket = io({ path: "/socket.io", transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("voice:start", { doctorName });
    });

    socket.on("voice:ready", () => {
      setSession("ready");
      void setupMic(socket);
    });

    socket.on("voice:audio", (base64: string) => {
      setSession("speaking");
      if (playbackCtxRef.current) {
        scheduleChunk(base64, playbackCtxRef.current, nextStartRef.current);
      }
    });

    socket.on("voice:user_text", (text: string) => {
      accUserTextRef.current += text;
    });

    socket.on("voice:text", (text: string) => {
      accTextRef.current += text;
      setLiveText(accTextRef.current);
    });

    socket.on("voice:turn_complete", () => {
      const userText = accUserTextRef.current.trim();
      const assistantText = accTextRef.current.trim();
      // Guard: skip jika sudah diproses (double-fire protection)
      if (!userText && !assistantText) {
        setSession("ready");
        return;
      }
      accUserTextRef.current = "";
      accTextRef.current = "";
      nextStartRef.current = { t: 0 };
      setLiveText("");
      const time = nowTime();
      setMessages(prev => {
        const next = [...prev];
        if (userText) next.push({ id: Date.now(), role: "user", text: userText, time });
        if (assistantText) next.push({ id: Date.now() + 1, role: "assistant", text: assistantText, time });
        return next;
      });
      setSession("ready");
    });

    socket.on("voice:interrupted", () => {
      nextStartRef.current = { t: 0 };
      accTextRef.current = "";
      accUserTextRef.current = "";
      isPttRef.current = false;
      setLiveText("");
      setSession("ready");
    });

    socket.on("voice:error", (msg: string) => {
      setError(`Connection error: ${msg}`);
      setSession("error");
    });

    socket.on("voice:closed", () => { setSession("idle"); });

    socket.on("connect_error", (e) => {
      setError(`Socket error: ${e.message}`);
      setSession("error");
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // PTT: tekan → reset playback queue + activityStart + mulai kirim audio
  const pttStart = useCallback(() => {
    if (!socketRef.current || isPttRef.current) return;
    // Reset playback queue dan buffer agar tidak nyambung ke turn sebelumnya
    nextStartRef.current = { t: 0 };
    accTextRef.current = "";
    accUserTextRef.current = "";
    isPttRef.current = true;
    socketRef.current.emit("voice:ptt_start");  // → activityStart ke Gemini
    setSession("recording");
  }, []);

  // PTT: lepas → activityEnd → Gemini langsung generate
  const pttEnd = useCallback(() => {
    if (!isPttRef.current) return;
    isPttRef.current = false;
    if (socketRef.current) {
      socketRef.current.emit("voice:end_turn");  // → activityEnd ke Gemini
    }
    setSession("processing");  // UI feedback: "mengirim..." sambil tunggu response
  }, []);

  // Space key untuk PTT
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
      e.preventDefault();
      pttStart();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      pttEnd();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [pttStart, pttEnd]);

  const isConnected = !["idle", "error", "connecting"].includes(sessionState);

  return (
    <div style={{ width: "100%", maxWidth: 1240, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
    {/* Two-column wrapper — kiri: chat area, kanan: pipeline */}
    <div style={{ width: "100%", display: "flex", gap: 32, alignItems: "flex-start" }}>
    {/* ── Kolom Kiri ── */}
    <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>

      {/* Header */}
      <div className="page-header" style={{ maxWidth: 900, width: "100%", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div className="page-title">Consult Audrey</div>
          <div className="page-subtitle">Clinical Consultation AI — Voice · Sentra Healthcare Solutions</div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          {isConnected && (
            <button onClick={() => void disconnect()} style={{
              fontFamily: "var(--font-geist-mono), monospace", fontSize: 11, letterSpacing: "0.1em",
              padding: "4px 12px", background: "none",
              border: "1px solid var(--c-critical)", color: "var(--c-critical)", cursor: "pointer",
            }}>PUTUS SESI</button>
          )}
          <button onClick={() => setMessages([])} style={{
            fontFamily: "var(--font-geist-mono), monospace", fontSize: 11, letterSpacing: "0.1em",
            padding: "4px 12px", background: "none",
            border: "1px solid var(--line-base)", color: "var(--text-muted)", cursor: "pointer",
          }}>RESET</button>
        </div>
      </div>

      {/* Alpha Notice */}
      <div style={{
        maxWidth: 900, width: "100%", marginBottom: 20,
        padding: "8px 14px",
        background: "rgba(230, 126, 34, 0.07)",
        border: "1px solid rgba(230, 126, 34, 0.3)",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 11, letterSpacing: "0.12em", color: "var(--c-asesmen)", flexShrink: 0 }}>
          ◈ ALPHA
        </span>
        <span style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.05em", lineHeight: 1.6 }}>
          Fitur ini masih dalam tahap pengembangan aktif. Performa, akurasi, dan stabilitas dapat berubah sewaktu-waktu.
        </span>
      </div>

      {/* About Audrey */}
      <div style={{
        maxWidth: 900, width: "100%", marginBottom: 24,
        borderLeft: "2px solid var(--c-asesmen)",
        paddingLeft: 16, display: "flex", flexDirection: "column", gap: 10,
      }}>
        <div style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 11, letterSpacing: "0.15em", color: "var(--c-asesmen)" }}>
          TENTANG AUDREY
        </div>
        <div style={{ fontFamily: "var(--font-geist-sans), sans-serif", fontSize: 14, color: "var(--text-main)", lineHeight: 1.75 }}>
          <strong style={{ color: "var(--text-main)" }}>Audrey</strong> adalah Clinical Consultation AI yang diciptakan oleh{" "}
          <strong style={{ color: "var(--text-main)" }}>dr. Ferdi Iskandar</strong> — Founder &amp; CEO Sentra Healthcare Solutions — sebagai bagian dari ekosistem{" "}
          <strong style={{ color: "var(--text-main)" }}>AADI (Advanced Augmentative Diagnostic Intelligence)</strong>.
        </div>
        <div style={{ fontFamily: "var(--font-geist-sans), sans-serif", fontSize: 14, color: "var(--text-muted)", lineHeight: 1.75 }}>
          Audrey dirancang untuk mendampingi dokter secara real-time selama encounter klinis — menjawab pertanyaan medis, membantu menyusun diferensial diagnosis, memberikan referensi dosis, tata laksana, dan kriteria rujukan, dengan mempertimbangkan konteks dan keterbatasan fasilitas Puskesmas PONED Balowerti.
        </div>
        <div style={{ fontFamily: "var(--font-geist-sans), sans-serif", fontSize: 14, color: "var(--text-muted)", lineHeight: 1.75 }}>
          Prinsip utama:{" "}
          <em style={{ color: "var(--text-main)" }}>"Technology enables, but humans decide."</em>{" "}
          Audrey adalah copilot klinis — bukan pengganti keputusan dokter. Seluruh keputusan klinis tetap menjadi tanggung jawab penuh dokter yang bertugas.
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          maxWidth: 900, width: "100%", marginBottom: 16,
          padding: "10px 14px", border: "1px solid var(--c-critical)",
          fontFamily: "var(--font-geist-mono), monospace", fontSize: 11,
          color: "var(--c-critical)", letterSpacing: "0.05em",
        }}>⚠ {error}</div>
      )}

      {/* Connect / Status */}
      <div style={{ maxWidth: 900, width: "100%", marginBottom: 28 }}>
        {sessionState === "idle" || sessionState === "error" ? (
          <>
            <button onClick={() => void connect()} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "16px 28px", background: "var(--c-asesmen)",
              border: "none", color: "#fff", cursor: "pointer",
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 11, letterSpacing: "0.12em",
            }}>
              <span style={{ fontSize: 20 }}>🎙</span>
              MULAI KONSULTASI DENGAN AUDREY
            </button>
            <div style={{
              marginTop: 16,
              display: "flex", flexDirection: "column", gap: 6,
              fontFamily: "var(--font-geist-mono), monospace", fontSize: 11,
              color: "var(--text-muted)", lineHeight: 1.8,
            }}>
              <div>Cara menggunakan Audrey:</div>
              <div style={{ paddingLeft: 12, display: "flex", flexDirection: "column", gap: 4, color: "var(--text-muted)", opacity: 0.8 }}>
                <div>1. Klik <em>Mulai Konsultasi</em> untuk terhubung ke Audrey</div>
                <div>2. <strong style={{ color: "var(--text-main)" }}>Tekan dan tahan</strong> tombol mikrofon saat ingin berbicara</div>
                <div>3. <strong style={{ color: "var(--text-main)" }}>Lepas tombol</strong> saat selesai berbicara — Audrey akan merespons</div>
                <div>4. Bisa juga menggunakan tombol <strong style={{ color: "var(--text-main)" }}>[SPACE]</strong> pada keyboard</div>
              </div>
            </div>
          </>
        ) : sessionState === "connecting" ? (
          <div style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.1em" }}>
            ⏳ MENGHUBUNGKAN...
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* PTT Button */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <button
                onMouseDown={pttStart}
                onMouseUp={pttEnd}
                onMouseLeave={pttEnd}
                onTouchStart={(e) => { e.preventDefault(); pttStart(); }}
                onTouchEnd={pttEnd}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "14px 28px",
                  background: sessionState === "recording" ? "var(--c-asesmen)" : "none",
                  border: `2px solid ${sessionState === "recording" ? "var(--c-asesmen)" : "var(--c-asesmen)"}`,
                  color: sessionState === "recording" ? "#fff" : "var(--c-asesmen)",
                  cursor: sessionState === "processing" ? "wait" : "pointer",
                  fontFamily: "var(--font-geist-mono), monospace", fontSize: 11, letterSpacing: "0.12em",
                  userSelect: "none", WebkitUserSelect: "none",
                  transition: "all 0.1s ease",
                  animation: sessionState === "recording" ? "audrey-pulse 0.8s ease-in-out infinite" : "none",
                  opacity: sessionState === "processing" ? 0.5 : 1,
                }}
              >
                <span style={{ fontSize: 18 }}>
                  {sessionState === "recording" ? "🔴" : "🎙"}
                </span>
                {sessionState === "recording"
                  ? "MEREKAM — Lepas untuk kirim"
                  : sessionState === "processing"
                  ? "MEMPROSES..."
                  : "TAHAN UNTUK BICARA"}
              </button>

              {sessionState === "speaking" && (
                <button
                  onClick={() => socketRef.current?.emit("voice:interrupt")}
                  style={{
                    fontFamily: "var(--font-geist-mono), monospace", fontSize: 11, letterSpacing: "0.1em",
                    padding: "4px 12px", background: "none", cursor: "pointer",
                    border: "1px solid var(--text-muted)", color: "var(--text-muted)",
                  }}
                >INTERUPSI</button>
              )}
            </div>

            {/* Status / hint */}
            <div style={{
              fontFamily: "var(--font-geist-mono), monospace", fontSize: 11,
              color: "var(--text-muted)", letterSpacing: "0.08em", opacity: 0.5,
            }}>
              {sessionState === "recording"
                ? "● MEREKAM"
                : sessionState === "processing"
                ? "● MENGIRIM KE AUDREY..."
                : sessionState === "speaking"
                ? "● AUDREY BERBICARA"
                : "Tahan tombol atau [SPACE] untuk bicara"}
            </div>

            {/* Live transcript Audrey */}
            {liveText && (
              <div style={{
                padding: "10px 14px", border: "1px solid var(--c-asesmen)",
                fontFamily: "var(--font-geist-sans), sans-serif", fontSize: 13,
                color: "var(--text-main)", fontStyle: "italic", opacity: 0.85,
              }}>{liveText}</div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes audrey-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.06); opacity: 0.75; }
        }
      `}</style>

      {/* Chat Messages */}
      <div style={{
        maxWidth: 900, width: "100%", marginBottom: 20,
        display: "flex", flexDirection: "column",
        borderTop: "1px solid var(--line-base)",
      }}>
        {messages.length === 0 ? (
          <div style={{
            padding: "48px 0", textAlign: "center",
            fontFamily: "var(--font-geist-mono), monospace", fontSize: 11,
            color: "var(--text-muted)", letterSpacing: "0.15em", opacity: 0.4,
          }}>
            — BELUM ADA PERCAKAPAN —
            <div style={{ opacity: 0.7, marginTop: 6, fontSize: 11 }}>
              Hubungkan dulu, lalu bicara langsung dengan Audrey
            </div>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isUser = msg.role === "user";
            const prevSame = i > 0 && messages[i - 1].role === msg.role;
            return (
              <div key={msg.id} style={{
                display: "flex",
                flexDirection: isUser ? "row-reverse" : "row",
                alignItems: "flex-end",
                gap: 10,
                paddingTop: prevSame ? 4 : 20,
                paddingBottom: 4,
              }}>
                {/* Avatar — hanya tampil kalau beda dari pesan sebelumnya */}
                <div style={{
                  width: 28, flexShrink: 0,
                  display: "flex", justifyContent: "center",
                  visibility: prevSame ? "hidden" : "visible",
                }}>
                  <div style={{
                    width: 28, height: 28,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: isUser ? "var(--c-asesmen)" : "var(--line-base)",
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontSize: 11, letterSpacing: "0.05em",
                    color: isUser ? "#fff" : "var(--text-muted)",
                  }}>
                    {isUser ? "DR" : "AI"}
                  </div>
                </div>

                {/* Bubble */}
                <div style={{ maxWidth: "72%", display: "flex", flexDirection: "column", gap: 3, alignItems: isUser ? "flex-end" : "flex-start" }}>
                  <div style={{
                    padding: "10px 14px",
                    background: isUser ? "var(--c-asesmen)" : "var(--bg-nav)",
                    border: isUser ? "none" : "1px solid var(--line-base)",
                    color: isUser ? "#fff" : "var(--text-main)",
                    fontFamily: "var(--font-geist-sans), sans-serif",
                    fontSize: 14, lineHeight: 1.75, whiteSpace: "pre-wrap",
                    // Bubble corners — rounded kecuali sudut dekat avatar
                    borderRadius: isUser
                      ? "12px 12px 2px 12px"
                      : "12px 12px 12px 2px",
                  }}>
                    {msg.text}
                  </div>
                  {/* Timestamp — hanya di pesan terakhir dalam satu blok */}
                  {(i === messages.length - 1 || messages[i + 1]?.role !== msg.role) && (
                    <div style={{
                      fontFamily: "var(--font-geist-mono), monospace", fontSize: 11,
                      color: "var(--text-muted)", letterSpacing: "0.05em", opacity: 0.6,
                      paddingLeft: isUser ? 0 : 2, paddingRight: isUser ? 2 : 0,
                    }}>
                      {isUser ? "DOKTER" : "AUDREY"} · {msg.time}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={{
        marginTop: 8,
        fontFamily: "var(--font-geist-mono), monospace", fontSize: 11,
        color: "var(--text-muted)", opacity: 0.4, letterSpacing: "0.08em",
      }}>
        Audrey bukan pengganti keputusan klinis dokter. · Sentra Healthcare Solutions
      </div>

    </div>{/* end kolom kiri */}

    {/* ── Kolom Kanan: Fine-Tuning Pipeline ── */}
    <div style={{
      width: 280, flexShrink: 0,
      fontFamily: "var(--font-geist-mono), monospace",
      fontSize: 11, color: "var(--text-muted)",
      borderLeft: "1px solid var(--line-base)",
      paddingLeft: 20, paddingTop: 4,
      display: "flex", flexDirection: "column", gap: 0,
    }}>
      <div style={{ fontSize: 11, letterSpacing: "0.15em", color: "var(--c-asesmen)", marginBottom: 16 }}>
        AUDREY FINE-TUNING PIPELINE
      </div>

      {/* Pipeline steps */}
      {[
        {
          n: "Real Clinical Data",
          sub: "IGD · Poli · Puskesmas",
          connector: true,
        },
        {
          n: "[1] DATA CURATION",
          sub: "dr. Ferdi review & annotation\nPHI scrubbing · Quality gate",
          connector: true,
        },
        {
          n: "[2] DOMAIN CORPUS",
          sub: "SOAP notes · Discharge summaries\nClinical Q&A · Protocol texts",
          connector: true,
        },
        {
          n: "[3] MEDGEMMA GROUNDING",
          sub: "Google DeepMind MedGemma\nMedical concept alignment\nICD-10 · SNOMED · BPJS coding",
          connector: true,
        },
        {
          n: "[4] VERTEX AI SFT",
          sub: "Google Vertex AI Pipelines\nPEFT / LoRA\nIndonesian medical language",
          connector: true,
        },
        {
          n: "[5] RLHF ALIGNMENT",
          sub: "Reinforcement Learning from Human Feedback\nHuman: dr. Ferdi (clinical steward)\nReward model on clinical accuracy",
          connector: true,
        },
        {
          n: "[6] EVALUATION & SAFETY",
          sub: "Clinical accuracy benchmarking\nPHI leak detection\nHallucination rate measurement",
          connector: true,
        },
        {
          n: "Audrey PRODUCTION MODEL",
          sub: "",
          connector: false,
          highlight: true,
        },
      ].map((step, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column" }}>
          <div style={{
            padding: "8px 10px",
            border: step.highlight ? "1px solid var(--c-asesmen)" : "1px solid var(--line-base)",
            background: step.highlight ? "rgba(230,126,34,0.07)" : "transparent",
            display: "flex", flexDirection: "column", gap: 3,
          }}>
            <div style={{
              fontSize: step.highlight ? 12 : 11,
              letterSpacing: "0.1em",
              color: step.highlight ? "var(--c-asesmen)" : "var(--text-main)",
              fontWeight: step.highlight ? 600 : 400,
            }}>
              {step.n}
            </div>
            {step.sub && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "pre-line", lineHeight: 1.6, opacity: 0.8 }}>
                {step.sub}
              </div>
            )}
          </div>
          {step.connector && (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              height: 20, justifyContent: "center",
            }}>
              <div style={{ width: 1, height: 12, background: "var(--line-base)" }} />
              <div style={{ width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: "5px solid var(--line-base)" }} />
            </div>
          )}
        </div>
      ))}

      <div style={{
        marginTop: 20, padding: "10px 12px",
        border: "1px solid var(--line-base)",
        display: "flex", flexDirection: "column", gap: 4,
      }}>
        <div style={{ fontSize: 11, letterSpacing: "0.12em", color: "var(--text-muted)", opacity: 0.6 }}>
          DIKEMBANGKAN OLEH
        </div>
        <div style={{ fontSize: 13, color: "var(--text-main)", letterSpacing: "0.02em" }}>
          dr. Ferdi Iskandar
        </div>
        <div style={{ fontSize: 11, color: "var(--c-asesmen)", letterSpacing: "0.05em" }}>
          Founder &amp; CEO
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.03em" }}>
          Sentra Healthcare Solutions
        </div>
      </div>
    </div>{/* end kolom kanan */}

    </div>{/* end two-column wrapper */}
    </div>
  );
}
