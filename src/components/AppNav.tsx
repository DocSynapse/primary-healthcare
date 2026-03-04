"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, LogOutIcon, MoonIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, SunIcon } from "lucide-react";
import { useTheme } from "./ThemeProvider";

const NAV_ITEMS = [
  { href: "/",              label: "Profil User"    },
  { href: "/emr",           label: "EMR Klinis"     },
  { href: "/voice",         label: "Consult Audrey" },
  { href: "/icdx",          label: "ICD-X Finder"   },
  { href: "/telemedicine",  label: "Telemedicine"   },
  { href: "/report",        label: "Report"         },
  { href: "/acars",         label: "ACARS"          },
];

const ACCENT = "#E67E22";

export default function AppNav() {
  const pathname          = usePathname();
  const { theme, toggle } = useTheme();
  const [crewName, setCrewName]   = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [hovered, setHovered]     = useState<string | null>(null);

  useEffect(() => {
    if (localStorage.getItem("puskesmas:nav-collapsed") === "true") setCollapsed(true);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") { e.preventDefault(); toggle_collapse(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function toggle_collapse() {
    setCollapsed(p => { localStorage.setItem("puskesmas:nav-collapsed", String(!p)); return !p; });
  }

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then((d: { user?: { displayName?: string } } | null) => { if (alive) setCrewName(d?.user?.displayName ?? ""); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  async function handleLogout() {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
    window.location.reload();
  }

  const w = collapsed ? 56 : 240;

  return (
    <>
      <nav className="app-nav" style={{ width: w, minWidth: w }}>

        {/* ── Header ── */}
        <div className="nav-header" style={{ border: 'none' }}>
          {!collapsed ? (
            <div style={{ padding: '32px 24px' }}>
              <div style={{ fontSize: 22, fontWeight: 300, color: '#EDEDED', letterSpacing: '-0.02em' }}>
                Puskesmas
              </div>
              <div style={{ 
                fontSize: 28, 
                fontWeight: 400, 
                color: '#F5EDE2', 
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontStyle: 'italic',
                letterSpacing: '0.02em',
                marginTop: 4,
                marginBottom: 4,
              }}>
                Intelligence
              </div>
              <div style={{ fontSize: 22, fontWeight: 300, color: ACCENT, letterSpacing: '-0.02em' }}>
                Dashboard
              </div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 16 }}>
                Powered by Sentra
              </div>
              <div style={{ fontSize: 10, color: '#555', marginTop: 20, fontStyle: 'italic' }}>
                Intellectual Property of dr. Ferdi Iskandar
              </div>
            </div>
          ) : (
            <div style={{ padding: '24px 0', textAlign: 'center' }}>
              <span style={{ fontSize: 20, fontWeight: 300, color: ACCENT }}>P</span>
            </div>
          )}
          <button className="nav-collapse-btn" onClick={toggle_collapse} title={collapsed ? "Expand (Ctrl+B)" : "Collapse (Ctrl+B)"}>
            {collapsed ? <PanelLeftOpenIcon size={14} /> : <PanelLeftCloseIcon size={14} />}
          </button>
        </div>

        {/* ── Menu — Aether MenuVertical style ── */}
        <div className="nav-menu">
          {NAV_ITEMS.map(({ href, label }) => {
            const isActive  = pathname === href;
            const isHovered = hovered === href;
            const lit       = isActive || isHovered;

            return (
              <div
                key={href}
                className="nav-menu-row"
                onMouseEnter={() => setHovered(href)}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Arrow — slides in from left */}
                <span
                  className="nav-menu-arrow"
                  style={{
                    opacity:   lit ? 1 : 0,
                    transform: lit ? "translateX(0)" : "translateX(-100%)",
                    color:     ACCENT,
                  }}
                >
                  <ArrowRight size={18} strokeWidth={2.5} />
                </span>

                {/* Label — shifts right & changes color */}
                <Link
                  href={href}
                  className="nav-menu-label"
                  style={{
                    color:     lit ? ACCENT : "var(--nav-muted)",
                    transform: lit ? "translateX(0)" : "translateX(-8px)",
                  }}
                >
                  {collapsed ? label.slice(0, 1) : label}
                </Link>
              </div>
            );
          })}
        </div>

        {/* ── Footer controls ── */}
        <div className="nav-controls" style={{ padding: collapsed ? "12px 8px" : "12px 16px" }}>
          <button
            className="nav-ctrl-btn"
            onClick={toggle}
            title={theme === "dark" ? "Light Mode" : "Dark Mode"}
            style={{ justifyContent: collapsed ? "center" : "space-between" }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {theme === "dark" ? <MoonIcon size={13} /> : <SunIcon size={13} />}
              {!collapsed && <span>{theme === "dark" ? "Dark Mode" : "Light Mode"}</span>}
            </span>
            {!collapsed && (
              <div className={`theme-toggle-track ${theme}`}>
                <div className="theme-toggle-thumb" />
              </div>
            )}
          </button>

          {!collapsed && crewName && (
            <div className="nav-crew">
              <span className="nav-crew-label">Crew</span>
              <span className="nav-crew-name">{crewName}</span>
            </div>
          )}

          <button
            className="nav-ctrl-btn nav-ctrl-btn--logout"
            onClick={handleLogout}
            title="Logout"
            style={{ justifyContent: collapsed ? "center" : "flex-start" }}
          >
            <LogOutIcon size={13} />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>

        {!collapsed && <div className="nav-footer">PUSKESMAS KEDIRI</div>}
      </nav>

      {/* Spacer */}
      <div aria-hidden style={{ width: w, minWidth: w, flexShrink: 0, transition: "width 0.25s cubic-bezier(0.4,0,0.2,1)" }} />
    </>
  );
}
