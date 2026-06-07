import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import { ThemeToggle } from "../components/ThemeToggle";
import { UserBadge } from "../components/UserBadge";
import "./globals.css";

const themeScript = `
(() => {
  const storageKey = "re-fudan-site-theme";
  const saved = window.localStorage.getItem(storageKey);
  const theme = saved === "light" || saved === "dark" ? saved : "dark";
  document.documentElement.setAttribute("data-theme", theme);
})();
`;

export const metadata: Metadata = {
  title: "RE:FUDAN - 让经验先抵达",
  description:
    "A campus agent-native social system. Your agent meets them first. You follow when it matters.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className="bg-canvas text-body antialiased">
        <Script id="re-fudan-theme-init" strategy="beforeInteractive">
          {themeScript}
        </Script>
        <div className="app-frame">
          <header className="app-topbar">
            <a className="app-brand" href="/">
              <span className="app-brand__mark">RE:FUDAN</span>
              <span className="app-brand__meta">Agent-native campus system</span>
            </a>

            <nav className="app-topbar__nav" aria-label="Primary">
              <a className="app-topbar__link" href="/">
                Overview
              </a>
              <a className="app-topbar__link" href="/agent-workbench">
                Workbench
              </a>
              <a className="app-topbar__link" href="/me">
                Dashboard
              </a>
            </nav>

            <div className="app-topbar__side">
              <div className="app-theme-pill">
                <UserBadge />
                <span>Theme</span>
                <ThemeToggle />
              </div>
            </div>
          </header>

          <div className="app-frame__body">{children}</div>
        </div>
      </body>
    </html>
  );
}
