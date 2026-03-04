import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { setSocketIO } from "./src/lib/emr/socket-bridge";
import { setTeleSocketIO } from "./src/lib/telemedicine/socket-bridge";
import { GoogleGenAI, Modality, type Session } from "@google/genai";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, turbopack: false } as Parameters<typeof next>[0]);
const handle = app.getRequestHandler();

type ChatMessage = {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  text: string;
  time: string;
};

type UserPresence = {
  userId: string;
  name: string;
  socketId: string;
};

const onlineUsers = new Map<string, UserPresence>();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: [
        "https://puskesmasbalowerti.com",
        "https://www.puskesmasbalowerti.com",
        "https://crew.puskesmasbalowerti.com",
        "https://primary-healthcare-production.up.railway.app",
        ...(process.env.NODE_ENV !== "production" ? ["http://localhost:3000", "http://localhost:7000"] : []),
      ],
      methods: ["GET", "POST"],
    },
  });

  // EMR Auto-Fill Engine: inject io instance untuk progress events
  setSocketIO(io);
  // Telemedicine: inject io untuk real-time request dari website
  setTeleSocketIO(io);

  io.on("connection", (socket) => {
    // User join: daftarkan ke online list
    socket.on("user:join", (user: { userId: string; name: string }) => {
      onlineUsers.set(user.userId, { userId: user.userId, name: user.name, socketId: socket.id });
      // broadcast daftar online ke semua
      io.emit("users:online", Array.from(onlineUsers.values()));
    });

    // Join room (1-on-1: room = sorted userId pair)
    socket.on("room:join", (roomId: string) => {
      socket.join(roomId);
    });

    // Kirim pesan ke room
    socket.on("message:send", (msg: ChatMessage) => {
      io.to(msg.roomId).emit("message:receive", msg);
    });

    // Typing indicator — kirim roomId ke client agar bisa filter per room
    socket.on("typing:start", ({ roomId, senderName }: { roomId: string; senderName: string }) => {
      socket.to(roomId).emit("typing:start", { senderName, roomId });
    });
    socket.on("typing:stop", ({ roomId }: { roomId: string }) => {
      socket.to(roomId).emit("typing:stop", { roomId });
    });

    // ── Gemini Live Voice Proxy ──────────────────────────────────────────────
    let geminiSession: Session | null = null;
    // State flags — shared antara onmessage callback dan PTT handlers
    let turnCompleteSent = false;
    let firstChunkSent = false;
    let turnStartedAt = 0;

    socket.on("voice:start", async (payload?: { doctorName?: string }) => {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) { socket.emit("voice:error", "GEMINI_API_KEY tidak ada"); return; }
      const doctorName = payload?.doctorName?.trim() || "Dokter";
      console.log(`[Audrey] voice:start — dokter: ${doctorName}`);

      try {
        const ai = new GoogleGenAI({ apiKey, apiVersion: "v1alpha" });
        geminiSession = await ai.live.connect({
          model: "gemini-2.5-flash-native-audio-preview-12-2025",
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
            },
            realtimeInputConfig: {
              // PTT mode: VAD dimatikan — dokter sendiri yang kontrol via audioStreamEnd
              automaticActivityDetection: { disabled: true },
            },
            inputAudioTranscription: {},
            systemInstruction: {
              parts: [{ text: `Kamu adalah Audrey — Clinical Consultation AI yang diciptakan oleh Sentra Healthcare Solutions untuk mendampingi dokter di Puskesmas Balowerti Kediri.

## SIAPA KAMU & SIAPA YANG MENCIPTAKANMU

Kamu diciptakan oleh **dr. Ferdi Iskandar** — Founder, CEO, dan Clinical Steward Sentra Healthcare Solutions. Beliau adalah:
- Dokter berlisensi dengan 12+ tahun pengalaman klinis dan eksekutif healthcare
- CEO rumah sakit swasta nasional selama 9+ tahun (berhasil turunkan kesalahan medis 60%, infeksi nosokomial 40%)
- Ahli Hukum Perdata spesialis malpraktik medis (analisis 140+ kasus malpraktik di Indonesia 2020–2025)
- Peneliti AI healthcare yang karyanya dikutip WHO
- Pendiri Sentra dengan misi: "Setiap Nyawa Berharga" — membangun infrastruktur AI klinis yang bertanggung jawab untuk Indonesia

**Sentra Healthcare Solutions** adalah perusahaan teknologi kesehatan Indonesia yang membangun AI untuk mendukung (bukan menggantikan) dokter. Prinsip utama: "Technology enables, but humans decide." Dokter selalu memegang keputusan akhir — kamu hanya copilot klinis yang cerdas.

Produk flagship Sentra adalah **AADI (Advanced Augmentative Diagnostic Intelligence)** — engine diagnostik berbasis 159 penyakit, 45.030 data kasus nyata dari Puskesmas Balowerti dan 4 fasilitas satelit, menggunakan algoritma IDF + Coverage + Jaccard dengan bobot epidemiologi lokal Indonesia.

Kamu, Audrey, adalah komponen voice intelligence dari ekosistem Sentra yang bertugas langsung di sisi dokter saat encounter klinis.

## CARA BICARA

Bayangkan kamu adalah dokter spesialis yang juga sahabat lama — pintar, cepat nangkap, tapi santai dan fun. Bukan presenter seminar. Bukan asisten virtual yang kaku.

- **Conversational, bukan monolog** — bicara seperti ngobrol, bukan ceramah
- **Intonasi hidup** — sesekali pakai "nah", "jadi gini", "menariknya", "yang sering kelewat itu...", "ini yang penting nih" — bukan terus-menerus formal
- **Tempo bervariasi** — poin penting disampaikan pelan dan jelas, transisi antar topik natural
- **Jangan terdengar seperti iklan atau presentasi** — tidak ada pembukaan yang berlebihan, tidak ada penutup yang bombastis
- **Langsung ke inti** — kalau dokter tanya dosis, jawab dosisnya dulu baru konteks
- Boleh sedikit humor ringan yang cerdas bila situasi memungkinkan — tapi jangan dipaksakan
- Bahasa Indonesia natural — boleh campur sesekali istilah Inggris/Latin yang memang lebih pas

## CARA MENJAWAB PERTANYAAN KLINIS

**Prinsip utama: Ringkas dulu, detail kalau diminta.**

Jawab dalam **2-3 kalimat padat** yang langsung ke inti. Dokter bisa langsung tanya lanjut kalau butuh detail lebih.

Contoh pola:
- Dokter tanya diagnosis → sebutkan diagnosis utama + 1-2 red flag paling penting
- Dokter tanya dosis → langsung sebut dosis, rute, frekuensi — tanpa basa-basi
- Dokter tanya tata laksana → 3 langkah utama saja, padat

**Kalau dokter minta lebih detail** ("jelaskan lebih", "lengkapnya gimana", "detail dong") — BARU elaborasi penuh: patofisiologi, kriteria diagnosis, tata laksana step-by-step, red flags, kriteria rujukan.

Selalu pertimbangkan keterbatasan Puskesmas: tidak ada CT/MRI/ICU/spesialis on-site.

## TEMPLATE KHUSUS

Jika ada yang bilang **"say hello buat audience"** atau **"sapa audience"** atau variasi serupa, SELALU jawab dengan versi ini (boleh sedikit bervariasi tapi substansi sama):

*"Halo semua, selamat pagi! Saya Audrey. Izin ya Ibu Kepala Puskesmas, drg. Endah Retno W. — sehat selalu ibu. Senang banget bisa ada di sini bareng teman-teman dokter Puskesmas Balowerti. Kalau ada yang mau dikonsulkan, langsung aja — saya siap."*

## KONTEKS FASILITAS — PROFIL PUSKESMAS PONED BALOWERTI

**Identitas:**
- Nama: UPTD Puskesmas PONED Balowerti, Kota Kediri
- Kepala Puskesmas: **drg. Endah Retno W.**
- Luas wilayah: 5,345 km² — mencakup 5 kelurahan: Balowerti, Dandangan, Ngadirejo, Semampir, Pocanan
- Batas: Utara (Kab. Kediri/Desa Jong Biru), Selatan (Kel. Kemasan & Setono Gedong), Timur (Kel. Banjaran), Barat (Sungai Brantas)
- Topografi: dataran rendah — koordinat 7°48'31.0"S, 112°00'48.4"E

**Visi:** "Terwujudnya masyarakat sehat yang mandiri di wilayah Puskesmas Balowerti."
**Misi:** Pelayanan kesehatan merata, berkualitas, profesional + peningkatan UKBM
**Motto:** NURANI — Nyaman, Unggul, Ramah, Aman, Ikhlas

**Layanan yang tersedia:**
Pemeriksaan Umum, Gigi & Mulut, KIA (Kesehatan Ibu & Anak), Gizi, Imunisasi, KB & Kesehatan Reproduksi, Kesehatan Jiwa, Kesehatan Remaja, Farmasi, VCT & IMS, Laboratorium, TB & Kusta, Kesehatan Lingkungan (Sanitasi)

**Administrasi pasien:** KTP + KK + kartu KIS/BPJS/Jamkesda. Tarif sesuai Perwali No. 30 Tahun 2020.

**Keterbatasan klinis yang selalu dipertimbangkan:**
Dikembangkan oleh: **dr. Ferdi Iskandar** — Founder & CEO Sentra Healthcare Solutions

Keterbatasan fasilitas yang selalu harus dipertimbangkan:
- TIDAK ada: CT scan, MRI, spesialis on-site, ICU, ventilator
- ADA: lab dasar (DL, GDS, urinalisis, goldar), USG (jika tersedia), EKG sederhana, oksimetri, obat-obatan esensial Fornas
- Selalu bedakan: bisa tangani di Puskesmas vs harus rujuk segera vs rujuk terencana

Kamu melayani dokter-dokter yang memiliki kompetensi klinis tinggi — perlakukan mereka sebagai sejawat, bukan siswa. Perkaya perspektif mereka dengan kedalaman klinis yang tidak bisa mereka temukan dalam 30 detik Google.

**NAMA DOKTER SESI INI: ${doctorName}**

Mulai setiap sesi dengan menyebut nama dokternya. Gunakan salam waktu yang tepat. Contoh:
- "Selamat pagi, ${doctorName}. Ada yang mau dikonsulkan?"
- "Selamat siang, ${doctorName} — ada kasus hari ini?"
- "Selamat sore, ${doctorName}. Mau mulai dari mana?"

Selanjutnya dalam percakapan, sesekali sebut namanya secara natural saat relevan — misalnya: "Nah, ${doctorName}, yang perlu diperhatikan di sini adalah..." atau "Betul, ${doctorName} — itu memang jadi dilema di FKTP."

JANGAN pakai "Hei" atau "Hey" sebagai pembuka. JANGAN terlalu sering sebut nama sampai terasa aneh — cukup sesekali dan natural.` }],
            },
          },
          callbacks: {
            onopen: () => { console.log("[ABBY] Gemini Live connected!"); socket.emit("voice:ready"); },
            onmessage: (msg: { serverContent?: { modelTurn?: { parts?: { inlineData?: { data?: string }; text?: string }[] }; turnComplete?: boolean; interrupted?: boolean; inputTranscription?: { text?: string } } }) => {
              const content = msg?.serverContent;
              if (!content) return;
              const parts = content?.modelTurn?.parts ?? [];
              for (const part of parts) {
                if (part?.inlineData?.data) {
                  if (!firstChunkSent) {
                    firstChunkSent = true;
                    console.log(`[Audrey] ⚡ first audio chunk — latency: ${Date.now() - turnStartedAt}ms`);
                  }
                  turnCompleteSent = false;
                  socket.emit("voice:audio", part.inlineData.data);
                }
                if (part?.text) {
                  socket.emit("voice:text", part.text);
                }
              }
              if (content?.inputTranscription?.text) {
                socket.emit("voice:user_text", content.inputTranscription.text);
              }
              if (content?.turnComplete && !turnCompleteSent) {
                turnCompleteSent = true;
                console.log(`[Audrey] turn_complete — total: ${Date.now() - turnStartedAt}ms`);
                socket.emit("voice:turn_complete");
              }
              if (content?.interrupted) {
                turnCompleteSent = false;
                firstChunkSent = false;
                socket.emit("voice:interrupted");
              }
            },
            onerror: (e: ErrorEvent) => { console.error("[Audrey] Gemini error:", e.message); socket.emit("voice:error", e.message); },
            onclose: (e: { code?: number; reason?: string }) => { console.log("[ABBY] Gemini closed", e?.code, e?.reason); socket.emit("voice:closed"); },
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[ABBY] catch error:", msg);
        socket.emit("voice:error", msg);
      }
    });

    socket.on("voice:audio_chunk", async (payload: { data: string; mimeType: string } | string) => {
      if (!geminiSession) return;
      // Support format lama (string) dan baru (object dengan mimeType)
      const data   = typeof payload === "string" ? payload : payload.data;
      const mimeType = typeof payload === "string" ? "audio/pcm;rate=16000" : payload.mimeType;
      try {
        await geminiSession.sendRealtimeInput({ audio: { data, mimeType } });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[Audrey] audio_chunk error:", msg);
        socket.emit("voice:error", `Audio stream error: ${msg}`);
        geminiSession = null;
      }
    });

    // PTT: dokter mulai bicara → reset flags + activityStart
    socket.on("voice:ptt_start", () => {
      if (!geminiSession) return;
      try {
        // Reset state flags untuk turn baru
        turnCompleteSent = false;
        firstChunkSent = false;
        turnStartedAt = Date.now();
        geminiSession.sendRealtimeInput({ activityStart: {} });
        console.log("[Audrey] voice:ptt_start — activityStart sent");
      } catch { /* ignore */ }
    });

    // PTT: dokter selesai bicara → activityEnd → Gemini langsung generate
    socket.on("voice:end_turn", () => {
      if (!geminiSession) return;
      try {
        geminiSession.sendRealtimeInput({ activityEnd: {} });
        console.log("[Audrey] voice:end_turn — activityEnd sent");
      } catch { /* ignore */ }
    });

    // Interrupt Audrey yang sedang berbicara → activityEnd
    socket.on("voice:interrupt", () => {
      if (!geminiSession) return;
      try {
        geminiSession.sendRealtimeInput({ activityEnd: {} });
        console.log("[Audrey] voice:interrupt — activityEnd sent");
      } catch (e) {
        console.error("[Audrey] interrupt error:", e instanceof Error ? e.message : String(e));
      }
    });

    socket.on("voice:stop", async () => {
      if (geminiSession) {
        try { geminiSession.close(); } catch { /* ignore */ }
        geminiSession = null;
      }
    });

    // Disconnect
    socket.on("disconnect", () => {
      if (geminiSession) {
        try { geminiSession.close(); } catch { /* ignore */ }
        geminiSession = null;
      }
      for (const [userId, presence] of onlineUsers.entries()) {
        if (presence.socketId === socket.id) {
          onlineUsers.delete(userId);
          break;
        }
      }
      io.emit("users:online", Array.from(onlineUsers.values()));
    });
  });

  function startListening(port: number) {
    httpServer.listen(port, () => {
      console.log(`▲ ACARS WebSocket Server ready on http://localhost:${port}`);
    });
  }

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      const PORT = parseInt(process.env.PORT || "7000");
      const fallback = PORT + 1;
      console.log(`⚠ Port ${PORT} in use, trying ${fallback}...`);
      process.env.PORT = String(fallback);
      httpServer.removeAllListeners("error");
      startListening(fallback);
    } else {
      throw err;
    }
  });

  startListening(parseInt(process.env.PORT || "7000"));
});
