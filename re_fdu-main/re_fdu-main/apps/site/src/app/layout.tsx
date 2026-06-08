import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import { ThemeToggle } from "../components/ThemeToggle";
import { UserBadge } from "../components/UserBadge";
import { productPrinciple, surfaceNames } from "@/lib/product-language";
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
    "AI 先代为表达，真人再决定是否连接的校园 Agent 协作系统。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="zh-CN" data-theme="dark" suppressHydrationWarning>
      <body className="bg-canvas text-body antialiased">
        <Script id="re-fudan-theme-init" strategy="beforeInteractive">
          {themeScript}
        </Script>
        <div className="app-frame">
          <header className="app-topbar">
            <a className="app-brand" href="/">
              <span className="app-brand__mark">RE:FUDAN</span>
              <span className="app-brand__meta">{productPrinciple}</span>
            </a>

            <nav className="app-topbar__nav" aria-label="Primary">
              <a className="app-topbar__link" href="/">
                总览
              </a>
              <a className="app-topbar__link" href="/agent-workbench">
                {surfaceNames.workspace}
              </a>
              <a className="app-topbar__link" href="/me">
                我的首页
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
