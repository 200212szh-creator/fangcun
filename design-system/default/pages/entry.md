# 进入页覆写规范：方寸品牌入口

- `/` is a calm, immersive brand entry for `方寸 · Fangcun Archive`; it is not the data dashboard.
- Always show these three lines at once: `方寸之间，万卷有序` as the Chinese headline, `A world of books, perfectly in order.` as the English secondary line, and `Eine Welt voller Bücher, wohlgeordnet` as the smaller German tertiary line. Locale switching never hides them.
- Use a warm paper background, deep navy wordmark container, brass micro-accent, abstract CSS shelf/book spines, and no remote video or external media dependency.
- Keep one primary action: enter the library. Language toggle and “next time enter directly” are secondary controls with 44px touch targets.
- Root-entry preference is stored only in localStorage. If enabled, `/` redirects to `/home`; deep links remain unaffected.
- The layout must fit 320px, 375px, desktop, and landscape without horizontal overflow. Do not make the entry page a fixed-height marketing canvas.
- The mark is an SVG with three simplified book spines, readable at 20/32/64px, deep/light variants, and an accessible label.
- Reduced motion disables decorative transforms and keeps the full copy visible.
