"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

const storageKey = "re-fudan-site-theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    const initial: Theme = saved === "light" || saved === "dark" ? saved : "dark";
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(storageKey, theme);
  }, [theme, mounted]);

  return (
    <button
      type="button"
      onClick={() =>
        setTheme((current) => (current === "dark" ? "light" : "dark"))
      }
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      aria-pressed={theme === "light"}
      className="relative inline-flex h-8 w-[4.5rem] shrink-0 items-center rounded-full border-2 border-border bg-surface-muted p-0.5 transition-all duration-300 ease-out hover:scale-105 hover:shadow-[0_0_11px_rgba(0,0,0,0.06)] hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
    >
      {/* Sun icon */}
      <span aria-hidden="true" className="absolute left-1.5 flex size-4 items-center justify-center">
        <svg
          className="size-3.5 transition-opacity duration-300"
          style={{ opacity: theme === "dark" ? 0.35 : 1 }}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      </span>

      {/* Moon icon */}
      <span aria-hidden="true" className="absolute right-1.5 flex size-4 items-center justify-center">
        <svg
          className="size-3.5 transition-opacity duration-300"
          style={{ opacity: theme === "dark" ? 1 : 0.35 }}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </span>

      {/* Sliding pill */}
      <span
        aria-hidden="true"
        className={`relative size-6 rounded-full bg-accent shadow-sm transition-all duration-300 ease-out ${
          theme === "dark"
            ? "translate-x-0"
            : "translate-x-[calc(100%+0.125rem)]"
        }`}
      />
    </button>
  );
}
