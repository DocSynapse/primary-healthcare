import type { Metadata } from "next";
import "./globals.css";
import { GeistSans, GeistMono } from "geist/font";
import AppNav from "@/components/AppNav";
import ThemeProvider from "@/components/ThemeProvider";
import CrewAccessGate from "@/components/CrewAccessGate";

export const metadata: Metadata = {
  title: "Sentra — Puskesmas Dashboard",
  description: "Clinical Information System — Sentra Healthcare Solutions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" data-theme="light" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className={GeistSans.className}>
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
