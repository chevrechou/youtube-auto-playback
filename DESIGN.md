# Design System — YouTube Auto-Playback

## Product Context
- **What this is:** A small Chrome extension that keeps YouTube videos
  playing (auto-resume, loop, dismiss "still watching?" prompts) and
  offers a distraction-free Zen Mode.
- **Who it's for:** The developer's own use and a casual public audience
  (Reddit/Product Hunt/Chrome Web Store) — a side project, not a company.
- **Space/industry:** Browser extension utilities.
- **Project type:** Extension popup UI (no web app, dashboard, or
  marketing site — the popup is the entire visual surface).
- **Memorable thing:** "It just works, no fuss." Every design decision
  should reduce friction, not add personality.

## Aesthetic Direction
- **Direction:** Industrial/Utilitarian — function-first, minimal
  decoration.
- **Decoration level:** Minimal — typography and spacing do all the work.
  No textures, gradients, or decorative shadows beyond one subtle card
  shadow.
- **Mood:** Calm, instantly legible, disappears into the browser chrome
  rather than asserting a distinct product identity.
- **Reference sites:** None — worked from first principles for a tiny
  utility popup rather than competitive research (deliberately skipped;
  see decisions log).

## Typography
- **Display/Hero:** N/A — no hero surface exists in a popup this small.
- **Body/UI/Labels:** System font stack — `-apple-system,
  BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`.
  **Deliberate departure from default guidance:** this skill normally
  flags system fonts as an anti-pattern ("gave up on typography"). Here
  it's the opposite call, made explicitly during the popup design review:
  a Chrome extension popup benefits from feeling like native browser
  chrome, not a branded webpage. Do not "fix" this to a branded typeface
  without revisiting that reasoning.
- **Data/Tables:** N/A — no tabular data in this product.
- **Code:** N/A.
- **Loading:** No web font loading — system stack only, zero network
  dependency (also avoids Manifest V3's remote-code restrictions).
- **Scale:**
  - Title: 14px, weight 600
  - Row label: 14px, weight 600
  - Description: 13px, weight 400
  - Footer: 11px, weight 400

## Color
- **Approach:** Restrained — one brand accent, one semantic pair,
  neutrals for everything else.
- **Primary/brand accent:** `#CC0000` — from the existing toolbar icon
  (red circle, white play triangle). Used sparingly: just the icon.
- **Semantic — on/success:** `#2E7D32` — reused from the original
  toolbar badge's ON state, now the switch "on" color too.
- **Semantic — off/neutral:** `#C7C7C7` — switch "off" color.
- **Neutrals:**
  - Text primary: `#1A1A1A`
  - Text muted: `#5F5F5F` (bumped up from an earlier `#6b6b6b`/11.5px
    combination that fell short of accessible contrast at small sizes —
    see the popup design review's accessibility pass)
  - Surface: `#FFFFFF`
  - Borders/dividers: `#E5E5E5` (header/footer), `#F0F0F0` (between rows)
- **Dark mode:** Surfaces invert to `#262626` (surface), `#161616` (page
  background), text to `#F0F0F0`/`#B0B0B0` (muted), borders to `#3A3A3A`/
  `#333333`. Brand/semantic colors (`#CC0000`, `#2E7D32`, `#C7C7C7`) stay
  the same in both modes — they carry enough of their own contrast.

## Spacing
- **Base unit:** 4px.
- **Density:** Compact — this is a ~300px-wide popup, not a page.
- **Scale:** 2xs(2) xs(4) sm(8) md(12) lg(16) xl(24)

## Layout
- **Approach:** Grid-disciplined — single-column stacked rows. No
  asymmetry or overlap; a popup has no room for editorial layout and
  doesn't want any.
- **Grid:** Single column, fixed ~300px width (popup width isn't
  responsive — Chrome controls it).
- **Max content width:** 300px.
- **Border radius:** Card 8px, switch pill `9999px` (full).

## Motion
- **Approach:** Minimal-functional — only the switch's own state
  transition animates.
- **Easing:** ease-out.
- **Duration:** ~150ms (short).

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-12 | Initial design system created | Created by `/design-consultation`, building on decisions already made in `/plan-design-review` for the Zen Mode popup (system font, `#2e7d32` accent, type-size accessibility fix) |
| 2026-07-12 | Skipped competitive research | Popup is a 2-switch utility surface; researching 5-10 competitor extensions wasn't expected to add meaningful signal at this scope |
| 2026-07-12 | System font stack chosen deliberately over a branded typeface | Native browser-chrome feel outweighs brand personality for this product; explicit exception to the general "avoid system fonts" rule |
