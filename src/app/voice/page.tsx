"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { io, Socket } from "socket.io-client";

type Message = {
  id: number;
  role: "user" | "assistant";
  text: string;
  time: string;
};

type SessionState = "idle" | "connecting" | "ready" | "recording" | "speaking" | "error";

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
  const startAt = Math.max(ctx.currentTime + 0.02, nextStartRef.t);
  source.start(startAt);
  nextStartRef.t = startAt + audioBuf.duration;
}

export default function VoicePage() {
  const [messages, setMessages]    = useState<Message[]>([]);
  const [sessionState, setSession] = useState<SessionState>("idle");
  const [error, setError]          = useState("");
  const [liveText, setLiveText]    = useState("");
  const socketRef      = useRef<Socket | null>(null);
  const audioCtxRef    = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletRef     = useRef<AudioWorkletNode | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const accTextRef     = useRef("");
  const nextStartRef   = useRef<{ t: number }>({ t: 0 });

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
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      await audioCtxRef.current.close();
    }
    audioCtxRef.current = null;
    nextStartRef.current = { t: 0 };
    accTextRef.current = "";
    setSession("idle");
    setLiveText("");
  }, []);

  async function setupMic(socket: Socket) {
    const ctx = audioCtxRef.current!;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      video: false,
    });
    mediaStreamRef.current = stream;

    await ctx.audioWorklet.addModule("/pcm-processor.js");
    const worklet = new AudioWorkletNode(ctx, "pcm-processor");
    workletRef.current = worklet;

    worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      const int16 = new Int16Array(e.data);
      const bytes = new Uint8Array(int16.buffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      socket.emit("voice:audio_chunk", btoa(binary));
    };

    const source = ctx.createMediaStreamSource(stream);
    source.connect(worklet);
    worklet.connect(ctx.destination);
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

    audioCtxRef.current = new AudioContext({ sampleRate: 16000 });
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
      if (audioCtxRef.current) {
        scheduleChunk(base64, audioCtxRef.current, nextStartRef.current);
      }
    });

    socket.on("voice:text", (text: string) => {
      accTextRef.current += text;
      setLiveText(accTextRef.current);
    });

    socket.on("voice:turn_complete", () => {
      const finalText = accTextRef.current;
      accTextRef.current = "";
      nextStartRef.current = { t: 0 };
      setLiveText("");
      if (finalText.trim()) {
        setMessages(prev => [...prev, {
          id: Date.now(),
          role: "assistant",
          text: finalText,
          time: nowTime(),
        }]);
      }
      setSession("ready");
    });

    socket.on("voice:interrupted", () => {
      nextStartRef.current = { t: 0 };
      accTextRef.current = "";
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

  const isConnected = !["idle", "error", "connecting"].includes(sessionState);

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "flex-start" }}>

      {/* Header */}
      <div className="page-header" style={{ maxWidth: 900, width: "100%", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div className="page-title">Consult Audrey</div>
          <div className="page-subtitle">Clinical Consultation AI — Voice · Sentra Healthcare Solutions</div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          {isConnected && (
            <button onClick={() => void disconnect()} style={{
              fontFamily: "var(--font-geist-mono), monospace", fontSize: 9, letterSpacing: "0.1em",
              padding: "4px 12px", background: "none",
              border: "1px solid var(--c-critical)", color: "var(--c-critical)", cursor: "pointer",
            }}>PUTUS SESI</button>
          )}
          <button onClick={() => setMessages([])} style={{
            fontFamily: "var(--font-geist-mono), monospace", fontSize: 9, letterSpacing: "0.1em",
            padding: "4px 12px", background: "none",
            border: "1px solid var(--line-base)", color: "var(--text-muted)", cursor: "pointer",
          }}>RESET</button>
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
        ) : sessionState === "connecting" ? (
          <div style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.1em" }}>
            ⏳ MENGHUBUNGKAN...
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{
                width: 52, height: 52, borderRadius: "50%",
                border: `2px solid ${sessionState === "speaking" ? "var(--c-asesmen)" : "#4CAF50"}`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
                boxShadow: sessionState === "speaking" ? "0 0 24px rgba(212,122,87,0.5)" : "0 0 24px rgba(76,175,80,0.4)",
                animation: "audrey-pulse 1.5s ease-in-out infinite",
              }}>
                {sessionState === "speaking" ? "🔊" : "🎙"}
              </div>
              <div style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 10, letterSpacing: "0.12em", color: "var(--text-muted)" }}>
                {sessionState === "speaking" ? "● AUDREY BERBICARA" : "● MENDENGARKAN — Bicara sekarang"}
              </div>
            </div>
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

      {/* Messages */}
      <div style={{ maxWidth: 900, width: "100%", minHeight: 300, marginBottom: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        {messages.length === 0 && (
          <div style={{
            padding: "48px 0", textAlign: "center",
            fontFamily: "var(--font-geist-mono), monospace", fontSize: 10,
            color: "var(--text-muted)", letterSpacing: "0.15em", opacity: 0.5,
          }}>
            — BELUM ADA PERCAKAPAN —<br />
            <span style={{ opacity: 0.6, marginTop: 8, display: "block" }}>
              Hubungkan dulu, lalu bicara langsung dengan Audrey
            </span>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} style={{
            display: "flex", flexDirection: msg.role === "user" ? "row-reverse" : "row",
            gap: 12, alignItems: "flex-start",
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: msg.role === "user" ? "var(--c-asesmen)" : "var(--line-base)",
              fontFamily: "var(--font-geist-mono), monospace", fontSize: 9,
              color: msg.role === "user" ? "#fff" : "var(--text-muted)",
            }}>
              {msg.role === "user" ? "DR" : "AI"}
            </div>
            <div style={{
              maxWidth: "75%", padding: "12px 16px",
              border: `1px solid ${msg.role === "user" ? "var(--c-asesmen)" : "var(--line-base)"}`,
              background: msg.role === "assistant" ? "rgba(239,236,230,0.03)" : "none",
            }}>
              <div style={{
                fontFamily: "var(--font-geist-sans), sans-serif",
                fontSize: 14, lineHeight: 1.7, color: "var(--text-main)", whiteSpace: "pre-wrap",
              }}>{msg.text}</div>
              <div style={{
                fontFamily: "var(--font-geist-mono), monospace", fontSize: 9,
                color: "var(--text-muted)", marginTop: 6, letterSpacing: "0.05em",
              }}>{msg.role === "user" ? "DOKTER" : "AUDREY"} · {msg.time}</div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div style={{
        marginTop: 8, maxWidth: 900,
        fontFamily: "var(--font-geist-mono), monospace", fontSize: 9,
        color: "var(--text-muted)", opacity: 0.4, letterSpacing: "0.08em",
      }}>
        Audrey bukan pengganti keputusan klinis dokter. · Sentra Healthcare Solutions
      </div>
    </div>
  );
}
