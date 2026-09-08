# 方寸 · Fangcun Archive — Design System

> Specific page overrides live in `design-system/default/pages/`. Read the relevant page file after this master file.

## Product direction

方寸是本地优先的个人藏书与论文资料工具。视觉应像一间安静、可持续整理的私人藏书室：编辑感、纸张感、低饱和、可扫描。品牌标识是三条简化书脊组成的拱形秩序图形，必须保持深浅背景下的清晰度，并提供 `aria-label`。

品牌的唯一来源是 `lib/brand.ts`：方寸 / Fangcun Archive；方寸之间，万卷有序 / A world of books, perfectly in order. / Eine Welt voller Bücher, wohlgeordnet。

## Tokens

| Role | Token | Direction |
|---|---|---|
| Background | `--parchment` | Warm paper, never pure gray |
| Foreground | `--ink` | Deep blue-black for 4.5:1 text contrast |
| Primary | `--navy` | Navigation, brand mark, primary action |
| Accent | `--brass` | Focus rings, metadata, restrained CTA accent |
| Surface | `--surface` | Opaque white card surface |
| Muted surface | `--paper-muted` | Quiet selection and empty-state surface |
| Border | `--border` | Visible dividers in both themes |

No ad-hoc screen-level brand colors. Use semantic tokens or existing book-cover variants.

## Typography and loading

- Display: local Instrument Serif regular / italic with `font-display: swap`.
- Chinese display fallback: `Songti SC`, `STSong`, `SimSun`, serif.
- Body: local Plus Jakarta Sans with `font-display: swap`; Chinese fallback is `Microsoft YaHei UI`, `Microsoft YaHei`, `PingFang SC`, `Noto Sans CJK SC`, sans-serif.
- Do not reference `/assets/fonts-source` at runtime; do not preload large Noto assets.
- Body copy starts at 16px with 1.5–1.75 line height; wrap rather than truncate meaningful copy.

## Layout and interaction

- Desktop: persistent sidebar; mobile: five-item bottom navigation with labels and icons.
- Active navigation uses a soft paper/navy state and a 2px left indicator; never use a gold capsule as the active container.
- Keep the primary CTA singular per screen. The app shell header contains search only; add-book CTA belongs in the home Hero, with unobtrusive actions elsewhere.
- Interactive targets are at least 44px, have visible focus, pointer/touch feedback, and 150–300ms transitions.
- Reserve space for fixed mobile navigation, safe-area insets, and do not create horizontal overflow at 320–375px.
- Use stable transforms/opacity for motion. Respect `prefers-reduced-motion` and keep content available without animation.

## Data integrity and performance

- Home statistics are derived from catalog/research APIs; an empty database shows zeros.
- Home does not call discovery services automatically.
- Shelf names and counts come from `ShelfLocation` records and owned-copy locations; no placeholder shelf labels or invented counts.
- Discovery may return an empty list. Explain the recovery path (check title / ISBN, retry, manual entry) and never fabricate fallback books.
- Debounced title lookup cancels stale requests. Query cache has a short stale period and does not refetch merely because the browser regains focus.
- Database initialization creates schema only. Fixtures belong in isolated tests, never in the production database.

## Brand and entry flow

- Root `/` is the lightweight branded entry page. `/home` is the real app home. Direct links such as `/add` and `/search` remain direct links.
- Entry hierarchy is fixed: Chinese main title, English secondary, German tertiary. UI locale does not hide any of the three motto lines.
- The entry page uses a CSS-based abstract shelf, no remote video, a language toggle, a reduced-motion-safe CTA, and a localStorage “enter directly next time” preference.
- The mark is an SVG with three simplified book spines, readable at 20/32/64px in deep/light variants with a descriptive accessible label.
