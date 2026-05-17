import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/**/*.{ts,tsx,js,jsx}',
  ],

  darkMode: ['selector', '[data-theme="dark"]'],

  theme: {
    extend: {
      // ── Font Families ──────────────────────────────────────────
      fontFamily: {
        heading: ["'Plus Jakarta Sans'", "'PingFang SC'", "'Microsoft YaHei'", 'sans-serif'],
        body: ['Inter', "'PingFang SC'", "'Microsoft YaHei'", "'Noto Sans SC'", 'sans-serif'],
        mono: ["'JetBrains Mono'", "'Courier New'", 'monospace'],
        accent: ['Collapse', 'sans-serif'],
        wordmark: ['FZCuSong', "'STSong'", "'SimSun'", 'serif'],
      },

      // ── Colors (CSS variable-backed semantic tokens) ──────────
      colors: {
        canvas: 'var(--bg-canvas)',
        surface: 'var(--bg-surface)',
        'surface-muted': 'var(--bg-surface-muted)',
        'accent-soft': 'var(--bg-accent-soft)',

        primary: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        body: 'var(--text-body)',
        muted: 'var(--text-muted)',

        border: 'var(--border-default)',
        'border-subtle': 'var(--border-subtle)',

        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'accent-soft-bg': 'var(--accent-soft)',
        'accent-soft-hover': 'var(--accent-soft-hover)',
      },

      // ── Borders ────────────────────────────────────────────────
      borderRadius: {
        card: '12px',
        chip: '999px',
        btn: '999px',
        input: '10px',
        control: '999px',
      },

      // ── Shadows ────────────────────────────────────────────────
      boxShadow: {
        card: '0 1px 3px rgba(0, 0, 0, 0.12)',
        'card-hover': '0 8px 24px rgba(0, 0, 0, 0.18)',
      },

      // ── Ring ───────────────────────────────────────────────────
      ringColor: {
        DEFAULT: 'var(--focus-ring)',
      },
    },
  },

  plugins: [],
}

export default config
