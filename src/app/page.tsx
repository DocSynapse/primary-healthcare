"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";

function calcAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

const QUICK_LINKS = [
  { label: "Satu Sehat",     desc: "Portal Kemenkes RI",          href: "https://satusehat.kemkes.go.id/sdmk/dashboard",          badge: "KEMENKES"  },
  { label: "Absen Apel Pagi",desc: "Presensi Harian",             href: "#absen-apel",                                            badge: "PRESENSI"  },
  { label: "SIPARWA",        desc: "E-Presensi Kota Kediri",      href: "https://epresensi.kedirikota.go.id/",                    badge: "ABSEN"     },
  { label: "SIM PKM",        desc: "Sistem Informasi Manajemen",  href: "#simpkm",                                                badge: "MANAJEMEN" },
  { label: "E-Rekam Medis",  desc: "ePuskesmas Kota Kediri",      href: "https://kotakediri.epuskesmas.id/pelayanan?broadcastNotif=1", badge: "EMR"  },
  { label: "P-Care BPJS",    desc: "Primary Care BPJS Kesehatan", href: "https://pcarejkn.bpjs-kesehatan.go.id/eclaim",           badge: "BPJS"      },
];

/* ── Letta design tokens — theme-aware via CSS variables ── */
function useL() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return {
    bg:        isDark ? "var(--bg-canvas)"            : "var(--bg-canvas)",
    bgPanel:   isDark ? "#303030"                     : "var(--bg-card, #F5EEE4)",
    bgHover:   isDark ? "rgba(255,255,255,0.05)"      : "rgba(201,168,124,0.06)",
    border:    isDark ? "rgba(255,255,255,0.10)"      : "var(--line-base)",
    borderAcc: isDark ? "rgba(230,126,34,0.4)"        : "rgba(201,168,124,0.5)",
    text:      isDark ? "#d4d4d4"                     : "var(--text-main)",
    muted:     isDark ? "#777777"                     : "var(--text-muted)",
    accent:    isDark ? "#E67E22"                     : "var(--c-asesmen)",
    green:     "#4ADE80",
    mono:      "var(--font-geist-mono), 'Fira Code', monospace",
    sans:      "var(--font-geist-sans), sans-serif",
  };
}

type LTokens = ReturnType<typeof useL>;

const Row = ({ L, label, val, mono = false, accent = false }: { L: LTokens; label: string; val: string; mono?: boolean; accent?: boolean }) => (
  <div style={{
    display: "grid",
    gridTemplateColumns: "120px 1fr",
    gap: 12,
    padding: "7px 0",
    borderBottom: `1px solid ${L.border}`,
    alignItems: "baseline",
  }}>
    <span style={{ fontFamily: L.mono, fontSize: 11, color: L.muted, letterSpacing: "0.06em" }}>{label}</span>
    <span style={{ fontFamily: mono ? L.mono : L.sans, fontSize: mono ? 11 : 13, color: accent ? L.accent : L.text, letterSpacing: mono ? "0.04em" : 0 }}>{val}</span>
  </div>
);

const SectionLabel = ({ L, children }: { L: LTokens; children: React.ReactNode }) => (
  <div style={{ fontFamily: L.mono, fontSize: 11, color: L.muted, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 10 }}>
    {children}
  </div>
);

const Panel = ({ L, children, style }: { L: LTokens; children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{
    background: L.bgPanel,
    border: `1px solid ${L.border}`,
    borderRadius: 4,
    overflow: "hidden",
    ...style,
  }}>
    {children}
  </div>
);

const PanelSection = ({ L, children, last = false }: { L: LTokens; children: React.ReactNode; last?: boolean }) => (
  <div style={{
    padding: "14px 18px",
    borderBottom: last ? "none" : `1px solid ${L.border}`,
  }}>
    {children}
  </div>
);

function getGreetingWord() {
  const h = new Date().getHours();
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 18) return "Selamat sore";
  return "Selamat malam";
}

function getDisplayName(raw: string): string {
  if (!raw) return "dokter";
  const lower = raw.toLowerCase();
  // Kenali crew yang diketahui
  if (lower.includes("ferdi")) return "Boss";
  if (lower.includes("joseph")) return "pak Joseph";
  if (lower.includes("cahyo")) return "pak Cahyo";
  if (lower.includes("efildan")) return "pak Efildan";
  // Fallback: gunakan nama asli
  return raw;
}

function useTypingEffect(text: string, speed = 40) {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    setDisplayed("");
    if (!text) return;
    let i = 0;
    const tick = () => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i < text.length) setTimeout(tick, speed);
    };
    const t = setTimeout(tick, 300); // delay awal
    return () => clearTimeout(t);
  }, [text, speed]);

  return displayed;
}

const HERO_TABS = ["Ringkasan Hari Ini", "Agent Sentra", "Berita Kesehatan"];

const CODE_LINES = [
  { num: 1, tokens: [{ t: "const ",        c: "#e06c75" }, { t: "pasien",        c: "#d4d4d4" }, { t: " = await ",     c: "#e06c75" }, { t: "EMR",          c: "#d6b48a" }, { t: ".getPasien(", c: "#d4d4d4" }, { t: "norm",         c: "#98c379" }, { t: ");",           c: "#555" }] },
  { num: 2, tokens: [] },
  { num: 3, tokens: [{ t: "const ",        c: "#e06c75" }, { t: "shift",         c: "#d4d4d4" }, { t: " = await ",     c: "#e06c75" }, { t: "Jadwal",       c: "#d6b48a" }, { t: ".getShift(",  c: "#d4d4d4" }, { t: '"pagi"',       c: "#98c379" }, { t: ");",           c: "#555" }] },
  { num: 4, tokens: [] },
  { num: 5, tokens: [{ t: "await ",        c: "#e06c75" }, { t: "SenAuto",       c: "#d6b48a" }, { t: ".analyze",      c: "#61afef" }, { t: "({",           c: "#555" }] },
  { num: 6, tokens: [{ t: "  pasien",      c: "#d4d4d4" }, { t: ": ",            c: "#555"   }, { t: "pasien.norm",   c: "#98c379" }, { t: ",",            c: "#555" }] },
  { num: 7, tokens: [{ t: "  mode",        c: "#d4d4d4" }, { t: ": ",            c: "#555"   }, { t: '"klinis"',      c: "#98c379" }, { t: ",",            c: "#555" }] },
  { num: 8, tokens: [{ t: "});",           c: "#555" }] },
];

function todayKey() {
  return new Date().toISOString().slice(0, 10); // "2026-03-02"
}

function loadAbsen(key: string): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(`absen_${key}_${todayKey()}`) === "1"; } catch { return false; }
}

function saveAbsen(key: string, val: boolean) {
  try { localStorage.setItem(`absen_${key}_${todayKey()}`, val ? "1" : "0"); } catch { /* noop */ }
}

export default function ProfilUserPage() {
  const L = useL();
  const age = calcAge("1982-02-26");

  const [absenApel,    setAbsenApel]    = useState(false);
  const [absenSiparwa, setAbsenSiparwa] = useState(false);

  useEffect(() => {
    setAbsenApel(loadAbsen("apel"));
    setAbsenSiparwa(loadAbsen("siparwa"));
  }, []);

  function toggleApel() {
    const next = !absenApel;
    setAbsenApel(next);
    saveAbsen("apel", next);
  }

  function toggleSiparwa() {
    const next = !absenSiparwa;
    setAbsenSiparwa(next);
    saveAbsen("siparwa", next);
  }

  const [crewName, setCrewName]   = useState("");
  const [activeTab, setActiveTab] = useState(0);
  const [heroExpanded, setHeroExpanded] = useState(true);
  const [chatHeight, setChatHeight]     = useState(340);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);
  const [news, setNews]           = useState<{ title: string; link: string; pubDate: string; source: string; description?: string }[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);

  // Chat state
  type ChatMsg = { role: "user" | "assistant"; content: string };
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput]       = useState("");
  const [chatLoading, setChatLoading]   = useState(false);
  const [chatError, setChatError]       = useState("");
  const chatBottomRef  = useRef<HTMLDivElement>(null);
  const chatScrollRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then((d: { user?: { displayName?: string } } | null) => {
        if (alive) setCrewName(d?.user?.displayName ?? "");
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (activeTab !== 2) return;
    setNewsLoading(true);
    fetch("/api/news")
      .then(r => r.json())
      .then((d: { items: { title: string; link: string; pubDate: string; source: string; description?: string }[] }) => {
        setNews(d.items ?? []);
        setNewsLoading(false);
      })
      .catch(() => setNewsLoading(false));
  }, [activeTab]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages, chatLoading]);

  async function sendChat() {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatInput("");
    setChatError("");
    const newMessages: ChatMsg[] = [...chatMessages, { role: "user", content: text }];
    setChatMessages(newMessages);
    setChatLoading(true);
    try {
      const res = await fetch("/api/perplexity", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = (await res.json()) as { ok: boolean; reply?: string; error?: string };
      if (!data.ok) {
        setChatError(data.error ?? "Gagal mendapat respons.");
      } else {
        setChatMessages([...newMessages, { role: "assistant", content: data.reply ?? "" }]);
      }
    } catch {
      setChatError("Tidak dapat terhubung ke server.");
    } finally {
      setChatLoading(false);
    }
  }

  function onResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: chatHeight };
    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return;
      const delta = ev.clientY - dragRef.current.startY;
      setChatHeight(Math.max(200, Math.min(1200, dragRef.current.startH + delta)));
    }
    function onUp() {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function renderMarkdown(text: string): string {
    return text
      // strip bracket tags like [identitas tetap]
      .replace(/\[[^\]]*\]/g, "")
      // bold **text**
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      // italic *text*
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      // inline code `text`
      .replace(/`([^`]+)`/g, "<code style=\"font-family:monospace;background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:3px;font-size:12px\">$1</code>")
      // newline → <br>
      .replace(/\n/g, "<br>");
  }

  const greetWord   = getGreetingWord();
  const displayName = getDisplayName(crewName);
  const fullGreet   = `${greetWord}, ${displayName}`;
  const typedGreet  = useTypingEffect(fullGreet, 38);

  return (
    <div style={{ width: "100%", maxWidth: 1240, display: "flex", flexDirection: "column", alignItems: "stretch" }}>

      {/* ── SVG Frame — pojok kanan atas ── */}
      <style>{`
        .svg-frame {
          position: fixed;
          top: 12px;
          right: 20px;
          width: 80px;
          height: 80px;
          transform-style: preserve-3d;
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 50;
          cursor: pointer;
        }
        .svg-frame svg {
          position: absolute;
          transition: .5s;
          z-index: calc(1 - (0.2 * var(--j)));
          transform-origin: center;
          width: 92px;
          height: 92px;
          fill: none;
        }
        .svg-frame:hover svg {
          transform: rotate(-80deg) skew(30deg) translateX(calc(12px * var(--i))) translateY(calc(-9px * var(--i)));
        }
        .svg-frame svg #center { transition: .5s; transform-origin: center; }
        .svg-frame:hover svg #center { transform: rotate(-30deg) translateX(12px) translateY(-1px); }
        #out2  { animation: svgRotate 7s ease-in-out infinite alternate; transform-origin: center; }
        #out3  { animation: svgRotate 3s ease-in-out infinite alternate; transform-origin: center; stroke: #ff0; }
        #inner3, #inner1 { animation: svgRotate 4s ease-in-out infinite alternate; transform-origin: center; }
        #center1 { fill: #ff0; animation: svgRotate 2s ease-in-out infinite alternate; transform-origin: center; }
        @keyframes svgRotate { to { transform: rotate(360deg); } }
      `}</style>

      <div className="svg-frame">
        <svg style={{ ["--i" as string]: 0, ["--j" as string]: 0 }}>
          <g id="out1">
            <path d="M72 172C72 116.772 116.772 72 172 72C227.228 72 272 116.772 272 172C272 227.228 227.228 272 172 272C116.772 272 72 227.228 72 172ZM197.322 172C197.322 158.015 185.985 146.678 172 146.678C158.015 146.678 146.678 158.015 146.678 172C146.678 185.985 158.015 197.322 172 197.322C185.985 197.322 197.322 185.985 197.322 172Z"></path>
            <path strokeMiterlimit="16" strokeWidth="2" stroke="#00FFFF" d="M72 172C72 116.772 116.772 72 172 72C227.228 72 272 116.772 272 172C272 227.228 227.228 272 172 272C116.772 272 72 227.228 72 172ZM197.322 172C197.322 158.015 185.985 146.678 172 146.678C158.015 146.678 146.678 158.015 146.678 172C146.678 185.985 158.015 197.322 172 197.322C185.985 197.322 197.322 185.985 197.322 172Z"></path>
          </g>
        </svg>

        <svg style={{ ["--i" as string]: 1, ["--j" as string]: 1 }}>
          <g id="out2">
            <path fill="#00FFFF" d="M102.892 127.966L105.579 123.75L101.362 121.063L98.6752 125.28L102.892 127.966ZM90.2897 178.19L85.304 178.567L85.6817 183.553L90.6674 183.175L90.2897 178.19ZM94.3752 177.88L94.7529 182.866L99.7386 182.488L99.3609 177.503L94.3752 177.88ZM106.347 130.168L110.564 132.855L113.251 128.638L109.034 125.951L106.347 130.168ZM93.3401 194.968L91.9387 190.168L87.1391 191.569L88.5405 196.369L93.3401 194.968ZM122.814 237.541L119.813 241.54L123.812 244.541L126.813 240.542L122.814 237.541ZM125.273 234.264L129.272 237.265L132.273 233.266L128.274 230.265L125.273 234.264ZM97.2731 193.819L102.073 192.418L100.671 187.618L95.8717 189.02L97.2731 193.819ZM152.707 92.3592L157.567 91.182L156.389 86.3226L151.53 87.4998L152.707 92.3592ZM119.097 109.421L115.869 105.603L112.05 108.831L115.278 112.649L119.097 109.421ZM121.742 112.55L117.924 115.778L121.152 119.596L124.97 116.368L121.742 112.55ZM153.672 96.3413L154.849 101.201L159.708 100.023L158.531 95.1641L153.672 96.3413ZM253.294 161.699L258.255 161.07L257.626 156.11L252.666 156.738L253.294 161.699ZM247.59 203.639L245.66 208.251L250.272 210.182L252.203 205.569L247.59 203.639ZM243.811 202.057L239.198 200.126L237.268 204.739L241.88 206.669L243.811 202.057ZM249.23 162.214L248.601 157.253L243.641 157.882L244.269 162.842L249.23 162.214ZM172 90.0557V85.0557H167V90.0557H172ZM208.528 98.6474L206.299 103.123L206.299 103.123L208.528 98.6474ZM237.396 122.621L240.409 126.611L244.399 123.598L241.386 119.608L237.396 122.621ZM234.126 125.09L230.136 128.103L233.149 132.093L237.139 129.08L234.126 125.09ZM206.701 102.315L204.473 106.791L204.473 106.791L206.701 102.315ZM172 94.1529H167V99.1529H172V94.1529ZM244.195 133.235L248.601 130.87L246.235 126.465L241.83 128.83L244.195 133.235ZM250.83 149.623L252.195 154.433L257.005 153.067L255.64 148.257L250.83 149.623ZM246.888 150.742L242.078 152.107L243.444 156.917L248.254 155.552L246.888 150.742ZM240.586 135.174L238.22 130.768L233.815 133.134L236.181 137.539L240.586 135.174ZM234.238 225.304L238.036 228.556L241.288 224.759L237.491 221.506L234.238 225.304ZM195.159 250.604L196.572 255.4L196.572 255.4L195.159 250.604ZM148.606 250.534L143.814 249.107L142.386 253.899L147.178 255.326L148.606 250.534ZM149.775 246.607L151.203 241.816L146.411 240.388L144.983 245.18L149.775 246.607ZM194.001 246.674L195.415 251.47L195.415 251.47L194.001 246.674ZM231.126 222.639L234.379 218.841L230.581 215.589L227.329 219.386L231.126 222.639Z"></path>
          </g>
        </svg>

        <svg style={{ ["--i" as string]: 0, ["--j" as string]: 2 }}>
          <g id="inner3">
            <path fill="#00FFFF" d="M195.351 135.352C188.265 130.836 180.022 128.473 171.62 128.546L171.627 129.346C179.874 129.274 187.966 131.594 194.921 136.026L195.351 135.352ZM171.62 128.546C163.218 128.619 155.018 131.127 148.011 135.765L148.453 136.432C155.33 131.88 163.38 129.418 171.627 129.346L171.62 128.546ZM147.899 136.32L148.086 136.603L148.753 136.161L148.566 135.878L147.899 136.32ZM194.921 207.974C187.966 212.406 179.874 214.726 171.627 214.654L171.62 215.454C180.022 215.527 188.265 213.163 195.351 208.648L194.921 207.974ZM171.627 214.654C163.38 214.582 155.33 212.12 148.453 207.567L148.011 208.234C155.018 212.873 163.218 215.38 171.62 215.454L171.627 214.654ZM148.566 208.122L148.753 207.838L148.086 207.397L147.899 207.68L148.566 208.122Z"></path>
          </g>
          <path stroke="#00FFFF" d="M240.944 172C240.944 187.951 235.414 203.408 225.295 215.738C215.176 228.068 201.095 236.508 185.45 239.62C169.806 242.732 153.567 240.323 139.5 232.804C125.433 225.285 114.408 213.12 108.304 198.384C102.2 183.648 101.394 167.25 106.024 151.987C110.654 136.723 120.434 123.537 133.696 114.675C146.959 105.813 162.884 101.824 178.758 103.388C194.632 104.951 209.472 111.97 220.751 123.249" id="out3"></path>
        </svg>

        <svg style={{ ["--i" as string]: 1, ["--j" as string]: 3 }}>
          <g id="inner1">
            <path fill="#00FFFF" d="M145.949 124.51L148.554 129.259C156.575 124.859 165.672 122.804 174.806 123.331C183.94 123.858 192.741 126.944 200.203 132.236C207.665 137.529 213.488 144.815 217.004 153.261C220.521 161.707 221.59 170.972 220.09 179.997L229.537 181.607C230.521 175.715 230.594 169.708 229.753 163.795L225.628 164.381C224.987 159.867 223.775 155.429 222.005 151.179C218.097 141.795 211.628 133.699 203.337 127.818C195.045 121.937 185.266 118.508 175.118 117.923C165.302 117.357 155.525 119.474 146.83 124.037C146.535 124.192 146.241 124.349 145.949 124.51Z" clipRule="evenodd" fillRule="evenodd"></path>
            <path fill="#00FFFF" d="M139.91 220.713C134.922 217.428 130.469 213.395 126.705 208.758L134.148 202.721C141.342 211.584 151.417 217.642 162.619 219.839C173.821 222.036 185.438 220.232 195.446 214.742L198.051 219.491C186.252 225.693 173.696 227.531 161.577 225.154C154.613 223.789 148.041 221.08 142.202 217.234L139.91 220.713Z" clipRule="evenodd" fillRule="evenodd"></path>
          </g>
        </svg>

        <svg style={{ ["--i" as string]: 2, ["--j" as string]: 4 }}>
          <path fill="#00FFFF" d="M180.956 186.056C183.849 184.212 186.103 181.521 187.41 178.349C188.717 175.177 189.013 171.679 188.258 168.332C187.503 164.986 185.734 161.954 183.192 159.65C180.649 157.346 177.458 155.883 174.054 155.46C170.649 155.038 167.197 155.676 164.169 157.288C161.14 158.9 158.683 161.407 157.133 164.468C155.582 167.528 155.014 170.992 155.505 174.388C155.997 177.783 157.524 180.944 159.879 183.439L161.129 182.259C159.018 180.021 157.648 177.186 157.207 174.141C156.766 171.096 157.276 167.989 158.667 165.245C160.057 162.5 162.261 160.252 164.977 158.806C167.693 157.36 170.788 156.788 173.842 157.167C176.895 157.546 179.757 158.858 182.037 160.924C184.317 162.99 185.904 165.709 186.581 168.711C187.258 171.712 186.992 174.849 185.82 177.694C184.648 180.539 182.627 182.952 180.032 184.606L180.956 186.056Z" id="center1"></path>
          <path fill="#00FFFF" d="M172 166.445C175.068 166.445 177.556 168.932 177.556 172C177.556 175.068 175.068 177.556 172 177.556C168.932 177.556 166.444 175.068 166.444 172C166.444 168.932 168.932 166.445 172 166.445ZM172 177.021C174.773 177.021 177.021 174.773 177.021 172C177.021 169.227 174.773 166.979 172 166.979C169.227 166.979 166.979 169.227 166.979 172C166.979 174.773 169.227 177.021 172 177.021Z" id="center"></path>
        </svg>
      </div>

      {/* ══════════════════════════════════════════
          ROW 1 — HERO GREETING (Letta style)
      ══════════════════════════════════════════ */}
      <div style={{
        width: "100%",
        maxWidth: 1240,
        border: `1px solid ${L.border}`,
        borderRadius: 6,
        overflow: "hidden",
        marginBottom: 24,
        background: L.bgPanel,
      }}>
        {/* Greeting */}
        <div style={{ padding: "20px 24px 0" }}>
          <div style={{ fontFamily: L.sans, fontSize: 22, fontWeight: 400, color: L.text, marginBottom: 4, minHeight: 32 }}>
            {typedGreet}
            <span style={{
              display: "inline-block", width: 2, height: 20,
              background: L.accent, marginLeft: 2, verticalAlign: "middle",
              animation: typedGreet === fullGreet ? "cursorBlink 0.8s step-end infinite" : "none",
            }} />
          </div>
        </div>
        <style>{`@keyframes cursorBlink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>

        {/* Tabs + controls */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: heroExpanded ? `1px solid ${L.border}` : "none",
          padding: "0 24px",
          marginTop: 12,
        }}>
          <div style={{ display: "flex" }}>
            {HERO_TABS.map((t, i) => (
              <div key={t} onClick={() => { setActiveTab(i); if (!heroExpanded) setHeroExpanded(true); }} style={{
                padding: "9px 16px",
                fontFamily: L.mono,
                fontSize: 11,
                color: i === activeTab ? L.text : L.muted,
                borderBottom: i === activeTab && heroExpanded ? `1px solid ${L.accent}` : "1px solid transparent",
                cursor: "pointer",
                letterSpacing: "0.04em",
                marginBottom: -1,
                transition: "color 0.15s",
              }}>{t}</div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              fontFamily: L.mono, fontSize: 11,
              color: L.muted, border: `1px solid ${L.border}`,
              borderRadius: 4, padding: "4px 12px",
              letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ color: "#555" }}>SIP:</span>
              <span>503/0129/••••••••/2025</span>
            </div>
            {/* Toggle expand/collapse */}
            <button
              type="button"
              onClick={() => setHeroExpanded(v => !v)}
              title={heroExpanded ? "Ciutkan" : "Perluas"}
              style={{
                background: "none",
                border: `1px solid ${L.border}`,
                borderRadius: 4,
                width: 28, height: 28,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer",
                color: L.muted,
                fontSize: 14,
                transition: "border-color 0.15s, color 0.15s",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = L.accent; e.currentTarget.style.color = L.accent; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = L.border; e.currentTarget.style.color = L.muted; }}
            >
              <span style={{
                display: "inline-block",
                transition: "transform 0.25s",
                transform: heroExpanded ? "rotate(0deg)" : "rotate(180deg)",
                lineHeight: 1,
              }}>⌃</span>
            </button>
          </div>
        </div>

        {/* Content — collapse wrapper */}
        <div style={{
          overflow: "hidden",
          maxHeight: heroExpanded ? chatHeight + 200 : 0,
          transition: "max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        }}>

        {/* TAB 0 — Ringkasan Hari Ini */}
        {activeTab === 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", minHeight: 160 }}>
            <div style={{ padding: "20px 24px", borderRight: `1px solid ${L.border}`, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontFamily: L.sans, fontSize: 13, fontWeight: 500, color: L.text, marginBottom: 6 }}>SenAuto — Clinical AI</div>
                <div style={{ fontFamily: L.sans, fontSize: 12, color: L.muted, lineHeight: 1.6 }}>
                  Analisis klinis otomatis, ekstraksi diagnosis, dan rekomendasi terapi berbasis AI.
                </div>
              </div>
              <a href="/emr" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: L.mono, fontSize: 11, color: L.muted, border: `1px solid ${L.border}`, borderRadius: 3, padding: "6px 12px", textDecoration: "none", marginTop: 16, transition: "border-color 0.15s, color 0.15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = L.accent; e.currentTarget.style.color = L.accent; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = L.border; e.currentTarget.style.color = L.muted; }}>
                Buka EMR Klinis ↗
              </a>
            </div>
            <div style={{ background: L.bgPanel, padding: "16px 0", overflowX: "auto" }}>
              <pre style={{ margin: 0, fontFamily: L.mono, fontSize: 12, lineHeight: 1.7, userSelect: "none" }}>
                {CODE_LINES.map((line) => (
                  <div key={line.num} style={{ display: "flex", paddingLeft: 16 }}>
                    <span style={{ color: "#333", minWidth: 24, textAlign: "right", marginRight: 16, fontSize: 11 }}>{line.num}</span>
                    <span>{line.tokens.map((tok, ti) => <span key={ti} style={{ color: tok.c }}>{tok.t}</span>)}</span>
                  </div>
                ))}
              </pre>
            </div>
          </div>
        )}

        {/* TAB 1 — Agent Sentra: Chat Perplexity */}
        {activeTab === 1 && (
          <div style={{ display: "flex", flexDirection: "column", height: chatHeight }}>
            {/* Header bar */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 20px",
              borderBottom: `1px solid ${L.border}`,
              flexShrink: 0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: L.green, boxShadow: `0 0 6px ${L.green}`, display: "inline-block" }} />
                <span style={{ fontFamily: L.mono, fontSize: 11, color: L.muted, letterSpacing: "0.1em" }}>Audrey — Clinical Consultation AI · Sentra Healthcare Solutions</span>
              </div>
              {chatMessages.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setChatMessages([]); setChatError(""); }}
                  style={{ background: "none", border: `1px solid ${L.border}`, borderRadius: 3, padding: "3px 10px", fontFamily: L.mono, fontSize: 11, color: L.muted, cursor: "pointer", letterSpacing: "0.06em" }}
                >
                  CLEAR
                </button>
              )}
            </div>

            {/* Pesan */}
            <div ref={chatScrollRef} style={{ flex: 1, overflowY: "auto", padding: "12px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
              {chatMessages.length === 0 && !chatLoading && (
                <div style={{ margin: "auto", textAlign: "center" }}>
                  <div style={{ fontFamily: L.mono, fontSize: 11, color: L.muted, marginBottom: 16 }}>
                    Tanyakan apa saja — klinis, farmakologi, diagnosis banding
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                    {[
                      "Dosis amoksisilin untuk anak 10kg?",
                      "DD demam + nyeri sendi akut?",
                      "Tatalaksana hipertensi grade 2 JNC 8",
                    ].map((s) => (
                      <button type="button" key={s} onClick={() => { setChatInput(s); }} style={{
                        background: "none", border: `1px solid ${L.border}`, borderRadius: 3,
                        padding: "5px 12px", fontFamily: L.mono, fontSize: 11, color: L.muted,
                        cursor: "pointer", letterSpacing: "0.04em", transition: "border-color 0.15s, color 0.15s",
                      }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = L.accent; e.currentTarget.style.color = L.accent; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = L.border; e.currentTarget.style.color = L.muted; }}
                      >{s}</button>
                    ))}
                  </div>
                </div>
              )}

              {chatMessages.map((msg, i) => (
                <div key={i} style={{
                  display: "flex",
                  flexDirection: msg.role === "user" ? "row-reverse" : "row",
                  gap: 10,
                  alignItems: "flex-start",
                }}>
                  <div style={{
                    flexShrink: 0, width: 22, height: 22, borderRadius: 2,
                    border: `1px solid ${msg.role === "user" ? L.borderAcc : L.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: L.mono, fontSize: 11, color: msg.role === "user" ? L.accent : L.muted,
                    letterSpacing: "0.04em",
                  }}>
                    {msg.role === "user" ? "YOU" : "AUDREY"}
                  </div>
                  {msg.role === "user" ? (
                    <div style={{
                      maxWidth: "78%",
                      background: L.bgPanel,
                      border: `1px solid ${L.borderAcc}`,
                      borderRadius: 4,
                      padding: "8px 12px",
                      fontFamily: L.sans,
                      fontSize: 13,
                      color: L.text,
                      lineHeight: 1.65,
                      whiteSpace: "pre-wrap",
                    }}>
                      {msg.content}
                    </div>
                  ) : (
                    <div
                      style={{
                        maxWidth: "78%",
                        background: L.bgPanel,
                        border: `1px solid ${L.border}`,
                        borderRadius: 4,
                        padding: "8px 12px",
                        fontFamily: L.sans,
                        fontSize: 13,
                        color: L.text,
                        lineHeight: 1.65,
                      }}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                    />
                  )}
                </div>
              ))}

              {chatLoading && (
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{
                    flexShrink: 0, width: 22, height: 22, borderRadius: 2,
                    border: `1px solid ${L.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: L.mono, fontSize: 11, color: L.muted,
                  }}>AUDREY</div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center", padding: "10px 0" }}>
                    {[0, 1, 2].map((d) => (
                      <span key={d} style={{
                        width: 4, height: 4, borderRadius: "50%", background: L.muted,
                        animation: "dotPulse 1.2s ease-in-out infinite",
                        animationDelay: `${d * 0.2}s`,
                        display: "inline-block",
                      }} />
                    ))}
                  </div>
                </div>
              )}

              {chatError && (
                <div style={{ fontFamily: L.mono, fontSize: 11, color: "var(--c-critical)", padding: "4px 0" }}>
                  ⚠ {chatError}
                </div>
              )}

              <div ref={chatBottomRef} />
            </div>

            {/* Input */}
            <div style={{
              display: "flex", gap: 8,
              padding: "10px 16px",
              borderTop: `1px solid ${L.border}`,
              flexShrink: 0,
              background: L.bgPanel,
            }}>
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (!e.shiftKey) void sendChat(); } }}
                placeholder="Ketik pertanyaan klinis..."
                disabled={chatLoading}
                style={{
                  flex: 1, height: 36, borderRadius: 4,
                  border: `1px solid ${L.border}`,
                  background: L.bgPanel,
                  color: L.text,
                  fontFamily: L.sans,
                  fontSize: 13,
                  padding: "0 12px",
                  outline: "none",
                }}
              />
              <button
                type="button"
                onClick={() => { void sendChat(); }}
                disabled={chatLoading || !chatInput.trim()}
                style={{
                  height: 36, padding: "0 16px", borderRadius: 4,
                  border: `1px solid ${L.borderAcc}`,
                  background: chatLoading || !chatInput.trim() ? "transparent" : "rgba(230,126,34,0.1)",
                  color: chatLoading || !chatInput.trim() ? L.muted : L.accent,
                  fontFamily: L.mono, fontSize: 11, letterSpacing: "0.06em",
                  cursor: chatLoading || !chatInput.trim() ? "not-allowed" : "pointer",
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                KIRIM
              </button>
            </div>

            {/* Resize handle */}
            <div
              onMouseDown={onResizeMouseDown}
              style={{
                height: 18,
                cursor: "ns-resize",
                background: "transparent",
                borderTop: `1px solid ${L.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                userSelect: "none",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              {/* grip dots */}
              <div style={{ display: "flex", gap: 3 }}>
                {[0,1,2,3,4].map(i => (
                  <span key={i} style={{ width: 3, height: 3, borderRadius: "50%", background: L.muted, display: "block", opacity: 0.5 }} />
                ))}
              </div>
            </div>
          </div>
        )}
        {/* TAB 2 — Berita Kesehatan */}
        {activeTab === 2 && (
          <div style={{ padding: "16px 24px", minHeight: 160 }}>
            {newsLoading ? (
              <div style={{ fontFamily: L.mono, fontSize: 11, color: L.muted, padding: "20px 0" }}>Memuat berita...</div>
            ) : news.length === 0 ? (
              <div style={{ fontFamily: L.mono, fontSize: 11, color: L.muted, padding: "20px 0" }}>Tidak ada berita tersedia.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {news.map((item, i) => (
                  <a key={i} href={item.link} target="_blank" rel="noopener noreferrer" style={{
                    display: "flex", flexDirection: "column", gap: 4,
                    padding: "11px 8px",
                    borderBottom: i < news.length - 1 ? `1px solid ${L.border}` : "none",
                    textDecoration: "none",
                    borderRadius: 3,
                    transition: "background 0.15s",
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = L.bgHover; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    {/* title + tanggal */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                      <div style={{ fontFamily: L.sans, fontSize: 13, color: L.text, lineHeight: 1.5 }}>{item.title}</div>
                      <span style={{ fontFamily: L.mono, fontSize: 11, color: L.muted, whiteSpace: "nowrap", letterSpacing: "0.06em", flexShrink: 0, marginTop: 2 }}>
                        {item.pubDate ? new Date(item.pubDate).toLocaleDateString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                      </span>
                    </div>
                    {/* description + source badge */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                      {item.description && (
                        <div style={{ fontFamily: L.sans, fontSize: 11, color: L.muted, lineHeight: 1.5, flex: 1 }}>
                          {item.description}
                        </div>
                      )}
                      <span style={{ fontFamily: L.mono, fontSize: 11, color: L.muted, letterSpacing: "0.08em", border: `1px solid ${L.border}`, borderRadius: 2, padding: "1px 6px", whiteSpace: "nowrap", flexShrink: 0 }}>
                        {item.source}
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        </div>{/* end collapse wrapper */}
      </div>
      <style>{`@keyframes dotPulse { 0%,80%,100%{opacity:0.2} 40%{opacity:1} }`}</style>

      {/* ── Toolbar header — Letta style ── */}
      <div style={{
        width: "100%",
        maxWidth: 1240,
        borderBottom: `1px solid ${L.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 32,
        paddingBottom: 0,
      }}>
        {/* Tab */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 0 }}>
          {["Profil User", "Identitas", "Pekerjaan"].map((t, i) => (
            <div key={t} style={{
              padding: "10px 20px",
              fontFamily: L.mono,
              fontSize: 12,
              color: i === 0 ? L.text : L.muted,
              borderBottom: i === 0 ? `1px solid ${L.accent}` : "none",
              cursor: i === 0 ? "default" : "pointer",
              letterSpacing: "0.04em",
            }}>{t}</div>
          ))}
        </div>

        {/* Badge kanan */}
        <div style={{
          fontFamily: L.mono,
          fontSize: 11,
          color: L.muted,
          border: `1px solid ${L.border}`,
          borderRadius: 4,
          padding: "4px 12px",
          letterSpacing: "0.06em",
        }}>
          NIP: 198202262009011003
        </div>
      </div>

      {/* ── 2-col grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 1240, width: "100%", alignItems: "start" }}>

        {/* ══ KOLOM KIRI — IDENTITAS + AKSES LAYANAN ══ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Panel L={L}>

          {/* Avatar block */}
          <PanelSection L={L}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{
                width: 56,
                height: 56,
                border: `1px solid ${L.borderAcc}`,
                borderRadius: "50%",
                overflow: "hidden",
                position: "relative",
                flexShrink: 0,
              }}>
                <img src="/doc.png" alt="dr. Ferdi Iskandar" style={{
                  position: "absolute", top: "-8%", left: "-5%",
                  width: "110%", height: "110%",
                  objectFit: "cover", objectPosition: "center 15%",
                }} />
              </div>
              <div>
                <div style={{ fontFamily: L.sans, fontSize: 16, fontWeight: 400, color: L.text, marginBottom: 4 }}>
                  dr. Ferdi Iskandar
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {["S.H.", "M.K.N.", "CLM.", "CMDC."].map((g) => (
                    <span key={g} style={{
                      fontFamily: L.mono, fontSize: 11,
                      color: L.muted, letterSpacing: "0.1em",
                      padding: "1px 6px", borderRadius: 2,
                      border: `1px solid ${L.border}`,
                    }}>{g}</span>
                  ))}
                </div>
              </div>
            </div>
          </PanelSection>

          {/* Data Pribadi */}
          <PanelSection L={L}>
            <SectionLabel L={L}>Data Pribadi</SectionLabel>
            <Row L={L} label="TTL"        val="Bengkulu, 26 Feb 1982" />
            <Row L={L} label="Usia"       val={`${age} tahun`} />
            <Row L={L} label="Jenis Kel." val="Laki-laki" />
            <Row L={L} label="Domisili"   val="Kediri, Indonesia" />
            <Row L={L} label="Gol. Darah" val="—" />
          </PanelSection>

          {/* Status */}
          <PanelSection L={L} last>
            <SectionLabel L={L}>Status</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {[
                { label: "AKTIF",        color: L.accent },
                { label: "DOKTER UMUM",  color: L.muted  },
                { label: "MEDIKOLEGAL",  color: L.muted  },
                { label: "AI HEALTHCARE",color: L.muted  },
              ].map((b) => (
                <span key={b.label} style={{
                  fontFamily: L.mono, fontSize: 11,
                  color: b.color, letterSpacing: "0.08em",
                  padding: "3px 10px", borderRadius: 2,
                  border: `1px solid ${b.color === L.accent ? L.borderAcc : L.border}`,
                  background: b.color === L.accent ? "rgba(230,126,34,0.06)" : "transparent",
                }}>{b.label}</span>
              ))}
            </div>
          </PanelSection>
        </Panel>

        {/* ── Akses Layanan (di bawah identitas, lebar sama) ── */}
        <div>
          <div style={{ fontFamily: L.mono, fontSize: 11, color: L.muted, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 12 }}>
            Akses Layanan
          </div>
          <div style={{ border: `1px solid ${L.border}`, borderRadius: 4, overflow: "hidden", display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
            {QUICK_LINKS.map((link, i) => {
              const isApel    = link.label === "Absen Apel Pagi";
              const isSiparwa = link.label === "SIPARWA";
              const checked   = isApel ? absenApel : isSiparwa ? absenSiparwa : false;
              const isAbsen   = isApel || isSiparwa;

              const wrapStyle: React.CSSProperties = {
                borderBottom: i < 3 ? `1px solid ${L.border}` : "none",
                borderRight: i % 3 !== 2 ? `1px solid ${L.border}` : "none",
                background: isAbsen && checked ? "rgba(74,222,128,0.06)" : "transparent",
                transition: "background 0.15s",
              };

              const innerStyle: React.CSSProperties = {
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: "11px 14px",
                width: "100%",
                height: "100%",
                textDecoration: "none",
                cursor: "pointer",
              };

              const labelColor  = isAbsen && checked ? L.green : L.text;
              const badgeColor  = isAbsen && checked ? L.green : L.muted;
              const badgeBorder = isAbsen && checked ? `1px solid ${L.green}` : `1px solid ${L.border}`;
              const badgeText   = isAbsen ? (checked ? "SUDAH" : link.badge) : link.badge;

              const content = (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {isAbsen && (
                      <span style={{
                        width: 12, height: 12, borderRadius: 2, flexShrink: 0,
                        border: `1px solid ${checked ? L.green : L.muted}`,
                        background: checked ? L.green : "transparent",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, color: L.bg,
                        transition: "all 0.2s",
                      }}>{checked ? "✓" : ""}</span>
                    )}
                    <span style={{ fontFamily: L.sans, fontSize: 12, color: labelColor, transition: "color 0.2s" }}>{link.label}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                    <div style={{ fontFamily: L.mono, fontSize: 11, color: L.muted, letterSpacing: "0.04em" }}>
                      {isAbsen && checked ? "Sudah diabsen" : link.desc}
                    </div>
                    <span style={{
                      fontFamily: L.mono, fontSize: 11,
                      color: badgeColor, letterSpacing: "0.08em",
                      padding: "1px 5px", borderRadius: 2,
                      border: badgeBorder, flexShrink: 0,
                      transition: "all 0.2s",
                    }}>{badgeText}</span>
                  </div>
                </>
              );

              return (
                <div key={i} style={wrapStyle}>
                  {isAbsen ? (
                    <button
                      type="button"
                      onClick={isApel ? toggleApel : toggleSiparwa}
                      style={{ ...innerStyle, background: "transparent", border: "none", textAlign: "left" }}
                      onMouseEnter={(e) => { if (!checked) e.currentTarget.parentElement!.style.background = L.bgHover; }}
                      onMouseLeave={(e) => { e.currentTarget.parentElement!.style.background = checked ? "rgba(74,222,128,0.06)" : "transparent"; }}
                    >
                      {content}
                    </button>
                  ) : (
                    <a
                      href={link.href}
                      target={link.href.startsWith("http") ? "_blank" : undefined}
                      rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
                      style={innerStyle}
                      onMouseEnter={(e) => { e.currentTarget.parentElement!.style.background = L.bgHover; }}
                      onMouseLeave={(e) => { e.currentTarget.parentElement!.style.background = "transparent"; }}
                    >
                      {content}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        </div>{/* ── end kolom kiri ── */}

        {/* ══ PANEL KANAN — PEKERJAAN ══ */}
        <Panel L={L}>

          {/* Posisi */}
          <PanelSection L={L}>
            <SectionLabel L={L}>Posisi</SectionLabel>
            <div style={{ fontFamily: L.sans, fontSize: 14, color: L.text, marginBottom: 4 }}>Dokter Penanggung Jawab</div>
            <div style={{ fontFamily: L.mono, fontSize: 11, color: L.muted, letterSpacing: "0.06em" }}>Puskesmas Balowerti — Kediri</div>
          </PanelSection>

          {/* Konsultan */}
          <PanelSection L={L}>
            <SectionLabel L={L}>Konsultan</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {["KIA", "USG", "IGD", "PONED", "VCT HIV", "JIWA"].map((k) => (
                <span key={k} style={{
                  fontFamily: L.mono, fontSize: 11,
                  color: L.accent, letterSpacing: "0.08em",
                  padding: "3px 10px", borderRadius: 2,
                  border: `1px solid ${L.borderAcc}`,
                  background: "rgba(230,126,34,0.04)",
                }}>{k}</span>
              ))}
            </div>
          </PanelSection>

          {/* Institusi */}
          <PanelSection L={L}>
            <SectionLabel L={L}>Institusi</SectionLabel>
            <Row L={L} label="Puskesmas"  val="Puskesmas Balowerti" />
            <Row L={L} label="Dinkes"     val="Dinas Kesehatan Kota Kediri" />
            <Row L={L} label="Perusahaan" val="Sentra Artificial Intelligence" accent />
            <Row L={L} label="Platform"   val="SentraOne" />
            <Row L={L} label="Jabatan"    val="CEO & Founder" />
          </PanelSection>

          {/* Kredensial */}
          <PanelSection L={L} last>
            <SectionLabel L={L}>Kredensial &amp; Lisensi</SectionLabel>
            <Row L={L} label="STR" val="ER00001614473619"              mono />
            <Row L={L} label="SIP" val="503/0129/SIP-SIK-D/419.104/2025" mono />
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: L.green, boxShadow: `0 0 6px ${L.green}`, display: "inline-block", flexShrink: 0 }} />
              <span style={{ fontFamily: L.mono, fontSize: 12, color: L.muted, letterSpacing: "0.1em" }}>STR &amp; SIP VALID — 2025</span>
            </div>
          </PanelSection>
        </Panel>
      </div>

      {/* ── Status Hari Ini ── */}
      <div style={{ maxWidth: 1240, width: "100%", marginTop: 32, marginBottom: 48 }}>
        <div style={{ fontFamily: L.mono, fontSize: 11, color: L.muted, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 16 }}>
          Status Hari Ini
        </div>
        <div style={{ border: `1px solid ${L.border}`, borderRadius: 4, overflow: "hidden" }}>
          {[
            { label: "Shift",           val: "Pagi (07:00 – 14:00)",                     ok: true          },
            { label: "Apel Pagi",       val: absenApel    ? "Sudah Absen"  : "Belum Absen",    ok: absenApel    },
            { label: "SIPARWA",         val: absenSiparwa ? "Sudah Check-in" : "Belum Check-in", ok: absenSiparwa },
            { label: "Pasien Hari Ini", val: "8 pasien",                                  ok: true          },
            { label: "SenAuto Session", val: "Active",                                    ok: true          },
          ].map((s, i, arr) => (
            <div key={s.label} style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "11px 18px",
              borderBottom: i < arr.length - 1 ? `1px solid ${L.border}` : "none",
            }}>
              <span style={{ fontFamily: L.mono, fontSize: 11, color: L.muted, letterSpacing: "0.08em" }}>
                {s.label}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: s.ok ? L.green : "var(--c-warning)",
                  boxShadow: s.ok ? `0 0 5px ${L.green}` : "0 0 5px var(--c-warning)",
                  display: "inline-block",
                }} />
                <span style={{ fontFamily: L.sans, fontSize: 13, color: L.text }}>{s.val}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
