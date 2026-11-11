# Brand

How JSPrismarine looks and sounds. The docs site implements this guide, and the
[brand kit](https://jsprismarine.dev/brand-kit) renders every color, the mark and
each component live from the same source.

| What                     | Where                                         |
| ------------------------ | --------------------------------------------- |
| Palette                  | `tools/docs/site/.vitepress/theme/tokens.ts`  |
| Mark geometry            | `tools/docs/site/.vitepress/theme/prism.ts`   |
| Derived shades and sizes | `tools/docs/site/.vitepress/theme/brand.css`  |
| Code colors              | `tools/docs/site/.vitepress/theme/codeTheme.ts` |
| Components               | `tools/docs/site/.vitepress/theme/components/` |
| Project facts            | `tools/docs/project.mts`                      |
| Docs facts               | `tools/docs/facts.mts`                        |
| Release notes            | `tools/docs/site/releases.data.mts`           |

## Position

JSPrismarine is the Bedrock server you run, own and build on. It is a product people choose, not a
library index. The brand is flat, bold and direct: big type, solid color blocks, hard edges, and real
commands and numbers instead of decoration.

Four audiences use the site. Each page should make clear which one it serves:

| Audience     | Wants                             | Landing tab     |
| ------------ | --------------------------------- | --------------- |
| Players      | Join a server and know what works | I play          |
| Hosts        | Install, configure and operate it | I host          |
| Add-on devs  | Packs, Molang and the package API | I build add-ons |
| Contributors | Clone, change, test and ship      | I contribute    |

## Color

The accent is <!-- fact:palette.accent -->`#5ca48a`<!-- /fact -->, shared with the JSPrismarine website. Every other color supports it.

| Token          | Hex       | Use                                                      |
| -------------- | --------- | -------------------------------------------------------- |
| `--jsp-accent` | <!-- fact:palette.accent -->`#5ca48a`<!-- /fact --> | Primary accent: buttons, highlights, active states.      |
| `--jsp-forest` | <!-- fact:palette.forest -->`#003829`<!-- /fact --> | Dark brand surface and light-mode link color.            |
| `--jsp-deep`   | <!-- fact:palette.deep -->`#00281d`<!-- /fact --> | Darkest surface: tile backgrounds and shadows.           |
| `--jsp-mint`   | <!-- fact:palette.mint -->`#a9d9c6`<!-- /fact --> | Body text on forest and the light facet of the mark.     |
| `--jsp-cream`  | <!-- fact:palette.cream -->`#efe9da`<!-- /fact --> | Light surface and text on dark.                          |
| `--jsp-ink`    | <!-- fact:palette.ink -->`#0b1713`<!-- /fact --> | Text on light and the terminal surface.                  |
| `--jsp-signal` | <!-- fact:palette.signal -->`#ff6b3d`<!-- /fact --> | Spot color for prompts, cursors and the core of the mark. |

`tokens.ts` is the authority for these values. The site config writes them into the page head as the
`--jsp-*` custom properties and builds the favicon from them, and `brand.css` mixes the supporting
shades (terminal chrome, progress tracks, page backgrounds, muted text) from them with `color-mix`.
If this table and `tokens.ts` disagree, `tokens.ts` wins and this table is out of date.

Rules:

- Surfaces are flat. No gradients, glows, blurs or translucent glass. Two flat exceptions keep
  surfaces apart: a 1px hairline edge where two surfaces are close in value (code blocks and tables in
  dark mode, soft cards on the light page), and the flat ink scrim behind the open menu.
- Blocks that touch differ in surface. The ticker is ink on the light page and `--jsp-deep` on the
  dark one, so it never merges with the accent tile above it.
- Signal orange marks small things: a prompt, a cursor, the core of the mark, a focus ring. A page
  may also use it for one solid block. It is never a link color and never a body text color.
- Text on `--jsp-accent` is `--jsp-deep`, through `--jsp-on-accent`. Forest on accent misses AA for
  body text, so forest stays on accent only in display type such as the hero's highlighted word. Text
  on `--jsp-signal` is `--jsp-ink`.
- Small text on forest is `--jsp-mint`. Accent on forest is for figures and display type only.
- Keep all text, muted text included, at WCAG AA contrast or better against its surface. The site's
  `--vp-c-text-2` and `--vp-c-text-3` are ink (or cream in dark mode) mixed down only as far as AA
  allows; reach for them instead of an opacity.

## Type

| Role    | Family              | Weights  | Notes                                 |
| ------- | ------------------- | -------- | ------------------------------------- |
| Display | Bricolage Grotesque | 500, 800 | Tight tracking (`-0.04em` and below). |
| Mono    | JetBrains Mono      | 400, 700 | Commands, labels, logs and code.      |

Headlines are set heavy and tight, in sentence case, and are allowed to be very large. Small labels
are mono, uppercase and letter-spaced, and never smaller than `--jsp-label-size`: that holds
for key hints, counts, dates, version tags and code-language labels too. System fonts are the
fallback when the web fonts do not load.

## Mark

The mark is a prism: a triangle split down the middle into an `--jsp-accent` face and a
`--jsp-mint` face, with a small `--jsp-signal` triangle at its core whose right half is shaded with
ink.

- Use `PrismMark` rather than redrawing it. The favicon and the nav logo come from the same geometry
  in `prism.ts`.
- Keep clear space of half the mark's width on every side.
- Do not rotate, outline, add shadows or recolor the faces. The mark works unchanged on cream,
  forest and ink, so it has no inverted version.
- The wordmark is `JSPrismarine`: one word, camel case, set in Bricolage Grotesque 800.

## Shape and motion

- Corners are `14px` on panels (`--jsp-radius-panel`) and `10px` on controls
  (`--jsp-radius-control`). Pills are fully round.
- Primary actions carry a hard offset shadow (`4px 4px 0`, no blur). It shrinks on hover and
  disappears on press, so the button reads as pushed in.
- Grids are tight: `10px` gaps (`--jsp-gap`) between solid blocks.
- Every control shows a signal-orange focus ring when reached by keyboard, with an ink band between
  the control and the ring. Signal alone is too faint on the light page; with the band the ring reads
  on cream, forest, ink and signal surfaces alike. `brand.css` sets it once for every element.
- On phones, controls are at least `--jsp-target` tall, the WCAG touch target size.
- Motion is short and mechanical. Honor `prefers-reduced-motion` by stopping tickers and cursors.
  Anything that moves on its own also stops on hover and has a Pause button, for readers who have not
  set reduced motion.

## Code

Code blocks sit on the terminal's ink surface in light and dark mode alike, so a command in the docs
looks like the console it runs in. `codeTheme.ts` builds the syntax theme from `tokens.ts`: comments
in the terminal's muted mint, keywords in accent, strings in mint, numbers and constants in signal,
names in cream. Every token color keeps AA against ink. On phones, code wraps instead of scrolling off
the screen edge, and the copy button stays visible where there is no hover.

## The landing page

- The hero says what JSPrismarine is in plain words beside the headline, and offers one link per
  audience into the tabs below it (`#start-play`, `#start-host` and so on).
- The page ends on a call to action with a command to copy, not on decoration. The footer under it
  links the main sections.

## The menu

The site has one menu, in `tools/docs/site/.vitepress/theme/site-menu/`, drawn from `megaMenus` in
`menus.mts`. It follows these rules at every width:

- **It reads as a menu.** Sections are labeled buttons with a chevron, Search is its own labeled
  button, and phones get a button that says Menu.
- **It grows out of the header.** The header's bottom edge is the panel's top edge. The open section's
  button becomes an ink tab that runs into the panel, and search opens in the header itself.
- **Ink means open.** The tab, the panel, the search field and, on phones, the header turn ink while
  the menu is open, and the panel ends on an accent rule.
- **You leave where you entered.** Close sits exactly where Menu was, and Esc returns focus to the
  button or field that opened the menu.
- **It knows where you are.** The current section carries the accent bar, the current page is
  highlighted, and a breadcrumb above the page names both.

## Voice

- State what the thing does. "One binary to host it." beats "A powerful solution for hosting."
- Prefer real commands, file names and numbers to adjectives. Never show a number the repository
  cannot back.
- Address the reader directly and keep sentences short.
- American English, sentence case headings, no exclamation marks, no emoji.

## Components

The docs theme registers these Vue components globally, so any site page can use them without an
import. Pages staged from `docs/` render as plain Markdown, so use the components from site-owned
pages such as `tools/docs/site/index.md` and `tools/docs/site/brand-kit.md`.

| Component                | Purpose                                                           |
| ------------------------ | ----------------------------------------------------------------- |
| `PrismMark`              | The mark as inline SVG, at any size.                              |
| `BrandButton`            | Primary, outline (on dark) and secondary (on the page) buttons.   |
| `TerminalWindow`         | A server console frame. Each `t-line` span in the slot is a line. |
| `AudienceTabs`           | Keyboard-navigable tabs with a pitch, a snippet and links each. `anchor` gives each tab a linkable id. |
| `BentoGrid`, `BentoTile` | Solid color tiles for short claims or figures.                    |
| `ParityBars`             | The behavior parity score and bars, counted as the tracker counts. |
| `CopyButton`             | Copies a command to the clipboard.                                |
| `LatestRelease`          | The newest release's version, date and first changes.             |
| `ReleaseNotes`           | Release notes from the changelog, with long groups collapsed.     |
| `PackageDirectory`       | A filterable grid of the published packages.                      |
| `Ticker`                 | A looping banner of short phrases, with a Pause button.           |

On doc pages, a hex color written as code, such as `#5ca48a`, renders with a chip of that color in
front of it, in inline code and in highlighted code blocks alike. `.vitepress/colorSwatches.ts`
adds the chip; a three- or four-digit value needs a letter, so issue numbers like `#123` stay plain.

## Content comes from the repository

The landing page states no fact that the repository already records. `project.data.mts` reads these
at build time:

- the server version;
- the published packages;
- the Node and pnpm requirements;
- the supported protocols and Minecraft releases;
- the default port and online mode;
- the release notes, from the server package's changelog.

The build fails when a command, package or source pattern the page relies on disappears. The terminal
preview uses the server's real startup log lines. `ParityBars` reads the tracker snapshot and shows
the gameplay behavior score that the parity tracker page leads with, not the data-table pass rate.
To add a claim to the page, add it to the loader rather than typing the value into a component.

Markdown pages follow the same rule through docs facts. A value the code owns is wrapped in a
marker, such as `<!-- fact:protocol.newest -->2225<!-- /fact -->`, which GitHub hides. The docs build
fills in the current value from `tools/docs/facts.mts`, so the site stays right when the code
changes; `pnpm run docs:facts` refreshes the values in the Markdown.

## Changing the brand

Change a color in `tokens.ts`, a shape in `prism.ts`, and a derived value in `brand.css`, never a hex
value in a component. Update this guide in the same commit when a token, font or rule changes.
