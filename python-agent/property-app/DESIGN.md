# Design System · The Ledger / Real Estate Manager

**Stack:** React Native · Expo SDK 54 · react-native-maps ^1.20 · light/dark theme
**Ground truth:** `src/theme/tokens.ts` (color, spacing, radius, type, shadow), `src/theme/ThemeContext.tsx` (light/dark), `src/components/ui/index.tsx` (Card, Button, Input, Badge, StatusBadge), `src/screens/MapScreenV2/**` (cartography layer).

> This file is the single source of truth for every new screen, card, or component. Every value below is extracted from the shipping code — none of it is borrowed from generic templates.

---

## 1. Visual Identity & Atmosphere

**Codename:** *The Ledger* — a calm, credible brokerage office that lets numbers speak.

- **Mood:** Professional, unhurried, quietly authoritative. The operator (a real agent mid-deal) must read prices and measurements at a glance, without fighting the chrome.
- **Atmosphere by system:** cool window-light gray-blue in the day mode, and a deep ink-navy field at night. One deliberate blue for action, green for yes, amber for watch-out, red for irreversible. Nothing else is colorful.
- **Depth policy:** flat is the default. Elevation is a *whisper* — reserved exclusively for floating map controls and sheets, never for in-line list rows (those separate with 1px hairlines instead).
- **Corner language:** generous `borderCurve: 'continuous'` softness on cards; full pill (radius 9999) on buttons/badges; medium 12px on inputs; small 8px on solid doodads.
- **Type:** Tajawal — geometric, Arabic-first, one family, four weights. Hierarchy comes from weight and ink, not from scrambling sizes.
- **Rhythm:** everything snaps to a 4pt grid (`4/8/12/16/20`). Whitespace is a feature, not an accident.

---

## 2. Color System (Palette & Roles)

Tokens are semantic, never raw. Components read `colors.*` — hardcoded hex is banned inside screens (the few inlined values below are the named exceptions for map tooling).

### Light — "window light on steel"
| Name | Value | Role |
|---|---|---|
| Paper White | `#F8FAFC` | base background `bg` / card hover |
| Pure Cloud | `#FFFFFF` | cards `bgCard`, secondary surfaces |
| Washed Slate | `#F1F5F9` | inner grounds, ghost fills `surface` |
| Hairline | `#E2E8F0` | borders, dividers, box strokes `border` |
| Ink | `#0F172A` | primary text |
| Steel | `#475569` | secondary text |
| Fog | `#94A3B8` | muted / placeholder `textMuted` |
| Agent Blue | `#2563EB` | primary action + focus `accent` |
| Agent Blue (pressed) | `#1D4ED8` | active/hover `accentHover` |
| Blue Bath | `#EFF6FF` | accent tint backgrounds `accentSurface` |
| Verdict Green | `#16A34A` | success / available / for-sale |
| Amber Ledger | `#D97706` | pending / warning |
| Erasure Red | `#DC2626` | error / delete / sold / rejected |
| Signal Teal | `#0891B2` | informational |

Surface tints (light): `#F0FDF4` / `#FFFBEB` / `#FEF2F2` / `#ECFEFF`.

### Dark — "night above the horizon"
Dark mode is not color-inversion; it is the same system *relit* — deeper backgrounds, lifted text, translucent inklings instead of filled pastels.

| Name | Value | Role |
|---|---|---|
| Seabed | `#0B1120` | screen background `bg` |
| Night Card | `#162032` | cards `bgCard` |
| Abyss | `#1E293B` | surfaces and borders (borders stay quieter) |
| Moonlight  | `#F1F5F9` | primary text |
| Ice | `#94A3B8` | secondary text |
| Tunnel | `#64748B` | muted / disabled |
| Action Azure | `#3B82F6` | primary action `accent` |
| Bright Azure | `#60A5FA` | pressed state |

Dark surface tints are translucent: `rgba(34,197,94,0.1)`, `rgba(245,158,11,0.1)`, `rgba(239,68,68,0.1)`, `rgba(6,182,212,0.1)`.

### Semantic tool palette (fixed constants for cartography)
- Client persona: buyer → Verdict Green; seller → Tax Ledger; both → amethyst `#7C3AED`.
- Mapping: draw/area → violet `#8B5CF6`; locate → `#3B82F6`; GPS track → `#10B981`; stop → `#DC2626` / `#F87171`; info geometry → teal `#0891B2`.

> **Fixed rule:** a color may only mean what the catalog says it means. No decorative use.

---

## 3. Typography

One family, four explicit weights, a strict size scale.

| Token | Face | Size | Weight | Use |
|---|---|---|---|---|
| display | `Tajawal_700Bold` | 28 (xxxl) | 700 | screen titles, hero numbers |
| card-title | `Tajawal_700Bold` | 16–19 | 700 | property/client names |
| section-head | `Tajawal_500Medium` | 14–16 | 500 | group titles |
| body | `Tajawal_400Regular` | 14 | 400 | content, labels |
| micro | `Tajawal_400Regular` | 12–13 | 400 | captions, metadata |
| money | `Tajawal_700Bold` | 16–19 | 700 | prices, headline values |

Scale: `fontSize = {xs:12, sm:13, md:14, lg:16, xl:19, xxl:23, xxxl:28}`.
Hierarchy rule: **lead with weight and ink**, not with font size — list items stay one size, differentiated by 700+primary vs 400+secondary.
Money: always formatted via `formatPrice` (`Intl.NumberFormat('ar-SA')`), weight 700, tabular numerics for stable alignment in dense lists.
RTL: containers flow right→left natively; directional glyphs (`chevron`, arrows) mirror with context. Never force `textAlign` away from the reading direction. No italics — Arabic shines with weight only.

---

## 4. Geometry & Elevation

- **Radius:** small 8 (inner solids) · medium 12 (inputs, embedded tiles) · **large 16 + `borderCurve:'continuous'`** (cards) · xl 20 (panels) · pill 9999 (buttons, badges, dots).
- **Buttons:** full pills every size — `height 44` default, `height 36` small; padding `20 / 14`.
- **Avatars:** circle 42–44 filled with initial letters.
- **Status dot:** 6–7px, semantic fill, no weird outline.
- **Shadows (`shadows.{sm,md,lg}`):** `sm` for floating chips/pills, `md/lg` for map toolbars & bottom sheets; list cards rely on hairlines, never shadows.

### Spacing
`spacing = {xs:4, sm:8, md:12, lg:16, xl:20, xxl:24, xxxl:32}` — page gutters `20`, column gap `12–16`, toolbar alignment on `constants*4`.

---

## 5. Core components

### Button ️ ️
- Variants: `primary` (accent fill, white label), `ghost` (washed surface), `outline` (transparent + hairline).
- Disabled: surface fill + muted text — the action still *reads* but is dead.
- Press: `activeOpacity 0.7–0.8`; structural content stays planted, never deform.

### Card ️
- `bgCard` + `1px border` + `radius.lg` continuous curvature.
- Row anatomy: [icon seat] → primary label + secondary caption → trailing value (money aligned via tabular).
- Press: `activeOpacity 0.8`, no fake-scale theater.

### Input ️
- `surface` fill, `1px border`, `radius.md`, `44` tall (`80` multiline), right-aligned per RTL, label above in `medium`.
- `disabled` → muted text + hardened border.

### Badge / StatusBadge
- Pill (`radius.full`), `paddingH 10` / `paddingV 3`, weight 600, ink = semantic color, ground = its `*Surface` tint.
- Mapping: for_sale/accepted/active/completed/seller → success; pending/countered/draft/rented → warning; sold/rejected/cancelled → error; buy_offer/scheduled/social_media/buyer → info; else neutral.

### Lists & screens
- Screen: fixed header → filter row that never collapses → scrollable content.
- Empty states: a confident one-liner + a real call-to-action, never a dead gray box.

---

## 6. Cartographic components (MapScreenV2)

These rules apply on the map, single-handedly outside the general system.

- **Base map:** Google Standard & Satellite stay stock. Custom visual treatment is served **only** through the local style-proxy at `127.0.0.1:8383`; engine is never touched while the treatment is off.
- **Tool rail (ControlCard):** a vertical typographic column on the right; card surface, pill radius, `shadows.lg`. Active icon fills `accent` + white glyph; idle icons are ink grey `#475569`. Size `19`.
- **Distance pill (measure):** a dark chip `#0F172A` under the center button — white thin text reads distance + bearing, hints `tap center to commit`. It lives with the center cluster and is driven programmatically (commensurate, not a floating card). It hides while `mapMoving`.
- **Ghost line (draw):** dashed (`lineDashPattern`) white stroke over a faint dark underlay so it survives light satellite surfaces during drag.
- **Measure / spatial drawer:** gathers in a side plate; answers surface in the center pill as a whisper.
- **The measuring gauge emotional curve:** values always echo feedback instantly (`spinner` / disabled state / inline message); nothing resolves in silence.

---

## 7. State & Interaction Principles

- **Destructive confirmation:** irreversible acts (delete, prune, wipe) require an explicit `error`-tinted confirm before executing.
- **Motion:** only transform/opacity, 100–200ms, one ease — no springs auditioning, no keyframe parades on content charts. The map itself may animate; the chrome must not.
- **Action feedback:** every human gesture answers (spinner in-flight, button disables, message appears). No silent clicks, no optimistic shadows.
- **Adaptive freshness:** breaking changes read from `Dimensions` via the token window; `wp/hp` only for proportional hero elements.

---

## 8. Anti-Patterns (Do NOT)

1. **No decorative color.** If a hue carries no meaning, it shouldn't be there.
2. **No heavy shadows on list lines.** Elevation is reserved for floating elements only.
3. **No violent `maxHeight`.** Content inside a sheet scrolls within a single real scroll root — never truncate by size, let it grow.
4. **No template dust.** Avoid the three machine-tasting compounds: cream+serif+terracotta, terminal black+acid green, luxury cream+bronze.
5. **No motion theater.** The UI is a ledger, not a highlight reel.
6. **No orphan rows.** Every line of data gets its fallback («غير محددة», «no data»), with row reserves intact (`flexShrink`, `numberOfLines`).
7. **No dead ends.** Errors are phrased as «what happened + how to fix it», always with a retry affordance.

---

## 9. Decision Checklist (before shipping any screen)

1. Color from `colors.*`? (Only the 4 cartographic constants may appear as raw hex.)
2. Radius from `radius.*` with a reason in the catalog?
3. Sequence volume on the 4px grid?
4. Type from `Tajawal_{400/500/700}` with the correct role?
5. Money aligned `tabular` + `Intl 'ar-SA'` + weight 700?
6. Depth: flat, `sm`, or `md/lg` — and is it *justified* by a floating/focal element?
7. RTL: chevrons mirrored, text follows document direction, no flipped LTR leakage?
8. Feedback for every gesture & empty/loading/error state?

**When in doubt, default to *less*: one accent, a hairline, Tajawal in one weight, and room to breathe.**