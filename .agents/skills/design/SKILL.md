---
name: design
description: JSPrismarine design work. Use for any UI or TUI design or styling: docs site pages, theme components and the landing page, the console TUI, mockups and artifacts, and any colors, type, layout, icons or interface copy that represent JSPrismarine.
---

# Design

The brand guide at [`docs/brand/README.md`](../../../docs/brand/README.md) is the authority for how
JSPrismarine looks and sounds. This skill applies it to whatever surface you are designing.

## 1. Read the brand guide

Read `docs/brand/README.md` in full before sketching or editing anything. Done when you can name the
palette tokens, the two typefaces, the mark rules, the shape and motion rules and the voice rules
without looking.

## 2. Find the surface

Each surface has its own source of truth. Read the files for the surface you are touching.

- **Docs site** (`tools/docs/site/`). Colors come from `.vitepress/theme/tokens.ts`, the mark from
  `prism.ts`, derived shades and sizes from `brand.css`. Reuse the components in
  `.vitepress/theme/components/` and register new ones in `theme/index.ts`; the brand kit page
  (`tools/docs/site/brand-kit.md`) shows each one live. Project facts come from
  `tools/docs/site/project.data.mts`.
- **Console TUI** (`packages/console/`). Read the `opentui` skill and
  `docs/research/console-tui/ux-design.md`. Colors come from the roles in
  `packages/console/src/theme/theme.ts` (`THEME_ROLES`). It has truecolor, 16-color and monochrome
  themes; give every new role a value in each. The console palette predates the brand guide and is tuned for terminals.
  When a change touches that palette, ask the user whether to move it toward the brand tokens.
- **Mockups and artifacts** outside the repository. Copy the token values from `tokens.ts` and the
  mark from `prism.ts`, and label any sample number as a sample.

## 3. Design to the rules

- Take every color from a token or theme role and every size from a `brand.css` variable. A hex value
  inside a component is a defect.
- Take every fact from the repository: versions, package names, commands, ports, protocols, parity
  numbers. On a site page, read it from `project.data.mts`; in Markdown under `docs/`, mark it as a
  docs fact from `tools/docs/facts.mts`. Add a missing fact there, so the page cannot drift.
- Check each command, log line and file name you show against the source that produces it.
- Write interface copy in the brand voice, and apply the `unslop` skill to it.
- Build with keyboard users in mind: visible focus rings, WAI-ARIA patterns for composite widgets,
  `prefers-reduced-motion` honored.

## 4. Verify what you made

Look at the result, not just the build output.

- **Docs site**: run `vitepress build site` from `tools/docs`, then view the changed pages in light
  mode, dark mode and at 390 px wide. A headless Chrome `--window-size` narrower than about 500 px
  still lays the page out at 500 px and crops it, which looks like horizontal overflow; set the
  width with the DevTools protocol's `Emulation.setDeviceMetricsOverride` instead.
- **Console TUI**: run `pnpm vitest run packages/console` from the repository root, then look at the
  console in a real terminal in truecolor, 16-color and `NO_COLOR` modes.

Done when every changed screen has been seen in each mode it supports and matches the brand guide.

## 5. Keep the guide true

When the work changes a token, a font, the mark or a rule, update `docs/brand/README.md` in the same
commit, and the brand kit page when a component is added or changed.
