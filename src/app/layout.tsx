import type { Metadata } from "next";
import "./globals.css";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import AppNav from "@/components/AppNav";
import ThemeProvider from "@/components/ThemeProvider";
import CrewAccessGate from "@/components/CrewAccessGate";

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sentra — Puskesmas Dashboard",
  description: "Clinical Information System — Sentra Healthcare Solutions",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" data-theme="dark" className={`${ibmPlexSans.variable} ${ibmPlexMono.variable}`}>
      <body className={ibmPlexSans.className}>
        <ThemeProvider>
          <CrewAccessGate>
            <div className="app-shell">
              <AppNav />
              <main className="app-content">
                {children}
              </main>
            </div>
          </CrewAccessGate>
        </ThemeProvider>
      </body>
    </html>
  );
}
