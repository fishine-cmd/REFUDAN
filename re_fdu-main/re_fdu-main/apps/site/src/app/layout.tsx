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
  title: "RE:FUDAN — 让经验先抵达",
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
        <div className="frame">
          <div className="frame__top">
            <div className="frame__actions">
              <a className="frame__button" href="/">
                Overview
              </a>
              <a className="frame__button" href="/agent-workbench">
                Workbench
              </a>
            </div>
            <div className="frame__theme">
              <UserBadge />
              <span>Theme</span>
              <ThemeToggle />
            </div>
          </div>
          <div className="frame__content">{children}</div>
        </div>
      </body>
    </html>
  );
}
