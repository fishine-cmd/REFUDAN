# Design System — Hermes-Derived Token Architecture

> Engineering reference for implementing the RE:FUDAN landing page.
> Purpose: Any frontend dev can implement the landing page correctly.

---

## Token System

RE:FUDAN uses a 3-token semantic color system derived from Hermes Agent's landing page. Both themes are dark-backed — there is no conventional "light mode."

### Cool theme (default)
```css
--bg: #041C1C;        /* deep teal */
--fg: #ffffff;        /* white — headlines only */
--mid: #ffe6cb;       /* warm cream — body text, borders, accents */
```

### Warm theme
```css
--bg: #170d02;        /* burnt umber */
--fg: #ffffff;        /* white — headlines only */
--mid: #FFAC02;       /* amber/gold — body text, borders, accents */
```

### Derived tokens
```css
--border: color-mix(in srgb, var(--mid) 20%, transparent);
--accent: var(--mid);
--surface: color-mix(in srgb, var(--mid) 4%, transparent);
```

### Key principle
`--mid` does double duty as body text color AND accent. The page has only 3 semantic slots (bg, fg, mid) — everything else derives from these via `color-mix()`.

---

## Typography

| Role | Font | Usage |
|------|------|-------|
| `font-display` | Collapse Bold | Headlines, section labels, wordmark EN, buttons |
| `font-ui` | Mondwest Regular | Body text, nav, descriptions |
| `font-zh` | FZCuSong (方正粗宋简体) | "复见" wordmark only |
| `font-mono` | Courier New (system) | Terminal demo content |

### Global text treatment
- `text-transform: uppercase` on body
- `letter-spacing: 0.04em` base
- `-webkit-font-smoothing: antialiased`
- `line-height: 1.5`

### Responsive base
```css
html { font-size: clamp(10px, calc(var(--vsq) * 5), 14px); }
/* where --vsq: calc(0.5vw + 0.5vh) */
```

### "复见" wordmark
```css
.wordmark-zh {
  font-family: "FZCuSong", serif;
  transform: scaleX(0.62);
  transform-origin: left center;
}
```
Stacked vertically above "RE:FUDAN" in Collapse Bold. Mimics Hermes "HERMES / AGENT" two-line logo.

---

## Grid System (.g / .gc)

The primary layout primitive. Creates bordered grid cells that auto-size based on child count.

```css
.g {
  border-left: 1px solid var(--border);
  display: grid;
  grid-template-columns: 1fr;
}
.g:has(.gc:nth-child(2)) { grid-template-columns: repeat(2, 1fr); }
.g:has(.gc:nth-child(3)) { grid-template-columns: repeat(3, 1fr); }
.g:has(.gc:nth-child(4)) { grid-template-columns: repeat(4, 1fr); }
.g:has(.gc:nth-child(5)) { grid-template-columns: repeat(5, 1fr); }
.g:has(.gc:nth-child(6)) { grid-template-columns: repeat(6, 1fr); }

.gc {
  border-right: 1px solid var(--border);
  padding: 1rem;
}
```

Borders are ALWAYS visible — they are a primary compositional device, not decorative.

---

## Motion Primitives

| Name | Implementation | Usage |
|------|---------------|-------|
| `blink` | `@keyframes blink { 0%,to{opacity:1} 50%{opacity:0} }` step-end | Terminal cursor |
| `gradient-stroke` | `@keyframes gradient-stroke { 0%{bg-pos:15% 15%} to{bg-pos:75% 75%} }` | Arc-border on demo box |
| `bg-breathe` | `@keyframes bg-breathe { 0%{scale(1)} to{scale(1.04)} }` 20s alternate | Background image |

### Arc-border technique
```css
.arc-border::before {
  background: linear-gradient(135deg, var(--accent), transparent 40%, transparent 60%, var(--accent));
  background-size: 200% 200%;
  animation: gradient-stroke 4s ease infinite;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  padding: 1px;
}
```

---

## Component Primitives

| Component | Description |
|-----------|-------------|
| Header (grid) | `.g`/`.gc` cells: wordmark + nav items + theme toggle |
| Hero | Centered, badge + h1 + subtitle + CTAs |
| Demo | 3fr terminal + 2fr image panel, arc-border |
| Features | 6-cell `.g`/`.gc` grid |
| Detail rows | Label (10rem) + value, stacked |
| Disclosure toggle | "MORE ∨" / "LESS ∧" for progressive reveal |
| Manifesto | Centered quote block |
| Footer | Single line, centered, low opacity |
| Theme toggle | Pill capsule with dot indicator |

---

## Section Flow (matches Hermes)

1. Header (sticky, grid cells, backdrop-blur)
2. Hero (100vh, centered)
3. Demo ("SEE IT IN ACTION" — terminal + image)
4. Features (6 cells)
5. Detail rows (Interfaces, Platforms, Environments, Protocol) with disclosure
6. Manifesto (centered quote)
7. Footer

---

## Confirmed Decisions (2026-05-17)

- Theme pair: Hermes original colors (both dark-backed)
- Background images: Demo section right panel ONLY
- Hero: CTA buttons (not install steps)
- Progressive disclosure: YES ("MORE ∨" / "LESS ∧")
- All text English except "复见" wordmark

---

## Source

Derived from Hermes Agent landing page reverse-engineering study (local research assets, not in repo).
Token files (`tokens.css`, `tailwind.config.ts`) are already integrated into `apps/site/`.
