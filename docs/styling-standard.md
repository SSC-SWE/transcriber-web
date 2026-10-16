# Styling Standard

The single source of truth for how the site is styled. This document applies to **every repo** in the site; code review enforces it. When a repo needs a new color, spacing value, or component style, add it here first, then use it.

## 1. Approach

- **Plain CSS only.** No Tailwind, no CSS-in-JS (styled-components/emotion), no CSS modules, no preprocessor, no class-utility library.
- One stylesheet per app (e.g. `src/theme.css`), imported once at the entry point (`main.tsx`).
- All design values come from **CSS custom properties in `:root`**. No magic numbers and no hardcoded hex values in component/rule bodies.

## 2. Design tokens

Tokens live in `:root`. Reference them everywhere; never write a raw value again.

```css
:root {
  color-scheme: dark;

  /* Surfaces */
  --bg: #101010;
  --card: #171717;
  --sidebar: #1f1f1f;
  --button: #171717;
  --segment-track: #101010;

  /* Lines */
  --border: rgba(255, 255, 255, 0.09);
  --button-border: #393939;

  /* Selection */
  --selected: rgba(255, 255, 255, 0.1);
  --segment-selected: rgba(255, 255, 255, 0.16);

  /* Text */
  --text: #ededed;
  --text-secondary: #a6a6a6;
  --text-tertiary: #8a8a8a;

  /* Semantic */
  --danger: #ff5f57;
  --accent: #ffffff;

  /* Motion */
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
}
```

Rules for extending:

- Add a token before adding a value. If a rule needs a value not in `:root`, add the token, don't inline the value.
- Name by **role**, not by look: `--danger`, `--text-secondary`, `--border` — never `--red`, `--gray-2`, `--line-3`.
- One accent color per app. The accent is used for focus rings, selection, and primary emphasis only.

## 3. Color

- Use semantic tokens (above), never raw hex in rules.
- **Contrast (WCAG AA):** body and muted text ≥ 4.5:1 against their surface; large text (≥ 18px, or bold ≥ 14px) ≥ 3:1. Muted/hint text is not exempt — check it (current tertiary `#8a8a8a` = 5.5:1 on `#101010`).
- `color-scheme: dark` must be set on `:root` so native controls (select popups, scrollbars, form controls) render dark instead of the OS light theme.

## 4. Typography

- One font stack, defined once on `body`, system-first plus CJK fallbacks:

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto,
  'Helvetica Neue', 'PingFang HK', 'PingFang TC', 'Microsoft JhengHei',
  'Noto Sans CJK TC', sans-serif;
```

- Sizes: 11–14px for UI/hint text, 16px for card titles, 26px for the page title. Line-height 1.5 for body, 1.1–1.2 for headings.
- Monospace (`ui-monospace, 'SF Mono', Menlo, monospace`) **only** for data that is measured — timestamps, durations, counters. Never as a stylistic choice.

## 5. Spacing & radius

- Spacing in **multiples of 4px** (4, 8, 12, 16, 20, 24, 32…).
- One radius system per app:
  - 6px — small controls (`btn-sm`, segmented buttons)
  - 8px — buttons, inputs, selects
  - 12px — cards, dropzone
  - 14px — modals/overlays
  - 50% — circular buttons (play/pause)

## 6. Naming (BEM-lite)

kebab-case throughout.

| Pattern | Meaning | Example |
|---|---|---|
| `block` | component root | `.sidebar`, `.card`, `.dropzone` |
| `block-element` | part of a block | `.sidebar-item`, `.card-title`, `.segment-time` |
| `block-element-element` | deeper part | `.sidebar-item-title`, `.sidebar-item-sub` |
| `.active` / `.open` / `.drag` | state modifier (separate class) | `.sidebar-item.active`, `.dropzone.drag` |
| `block-variant` | variant (suffix on the block) | `.btn-primary`, `.btn-danger`, `.btn-ghost`, `.btn-sm` |

Rules:

- Element names describe **role**, not color: `.card-title`, not `.card-white`.
- States are applied by **adding a class**, not by redefining the base selector: `.sidebar-item.active`, not `.sidebar-item-active`.
- Variants stack: `class="btn btn-primary btn-sm"` — base class always present.

## 7. States

Every interactive element gets all five:

1. **default**
2. **hover**
3. **focus-visible** — a visible ring, never `outline: none` without a `:focus-visible` replacement
4. **active** — press feedback (`transform: scale(0.97)`)
5. **disabled** — reduced opacity + `cursor: default`

```css
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.btn:active,
.play-btn:active {
  transform: scale(0.97);
}
```

## 8. Motion

- One easing token, used everywhere: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`. No `ease`, no `ease-in` on UI.
- UI transitions stay under **300ms** and animate `transform` and `opacity` only.
- Respect reduced motion — every animation collapses:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

## 9. Bans

- **No inline `style={{...}}`.** All styling via classes in the stylesheet.
- **No `!important`**, except the reduced-motion override above.
- **No hardcoded hex / raw values** outside `:root`.
- **No magic z-index.** Use a documented scale (dropdown → sticky → modal → toast) and a token per level.
- **No nested cards.** Group with borders, dividers, or space.
- **No emoji/glyphs as icons.** Use the shared SVG icon set.

## 10. Accessibility

- Focus-visible ring on every focusable element (keyboard users never see hover).
- Labels above inputs; never placeholder-as-label.
- Touch targets ≥ 44px.
- Errors announced (`role="alert"` / `aria-describedby`) and shown below the field.

## 11. Pre-merge checklist

- [ ] No inline `style={{...}}` — all classes.
- [ ] No raw hex or magic numbers outside `:root`.
- [ ] Contrast passes (body ≥ 4.5:1, large ≥ 3:1).
- [ ] All five states defined; `:focus-visible` present, no bare `outline: none`.
- [ ] `prefers-reduced-motion` respected.
- [ ] New values added to this document if the token set was extended.
