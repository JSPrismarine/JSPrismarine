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
  dark one, so it never merges with the accent tile above it. In dark mode a panel that holds cards is
  `--jsp-deep` and its cards are forest, so page, panel and card are three distinct levels.
- Signal orange marks small things: a prompt, a cursor, the core of the mark, a focus ring, the rule
  beside a change that breaks or removes something, and the square beside a parity group under half
  passing. A page may also use it for one solid block. It is never a link color and never a body text
  color.
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
for key hints, counts, dates, version tags and code-language labels too. Identifiers, such as
package names (on the package cards, the API index and its sidebar) and parity family and group
ids, are mono, never display type, whose tight tracking hides their
dots. A display figure with dots in it, such as a version, opens its tracking to `-0.03em` for the
same reason. System fonts are the fallback when the web fonts do not load.

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
  disappears on press, so the button reads as pushed in. The shadow is ink on light surfaces and mint
  on forest and in dark mode (`--jsp-primary-shadow`), where an ink shadow would vanish. Secondary
  and outline buttons have no shadow: an edge alone, filled on hover, so only the primary action
  looks like a key to press.
- A 2px edge marks a control (a tab, a button, a filter). A link card is a soft fill with a hairline
  and an arrow.
- A state bar, such as the current section under the header or the current page in the sidebar,
  needs 3:1 against the page (`--jsp-state`). Accent on the light page falls short, so the bar is
  forest there and accent in dark mode.
- A selected tab or filter pill is ink in light mode and accent in dark mode, so it stands apart
  from the accent figure tiles on the light page and from the ink surfaces on the dark one. A
  selectable tile, such as a parity group, is a figure tile and stays accent when selected.
- Grids are tight: `10px` gaps (`--jsp-gap`) between solid blocks.
- Every control shows a signal-orange focus ring when reached by keyboard, with an ink band between
  the control and the ring. Signal alone is too faint on the light page; with the band the ring reads
  on cream, forest, ink and signal surfaces alike. `brand.css` sets it once for every element.
- On phones, controls are at least `--jsp-target` tall, the WCAG touch target size.
- Motion is short and mechanical. Honor `prefers-reduced-motion` by stopping tickers and cursors.
  Anything that moves on its own also stops on hover and has a Pause button, for readers who have not
  set reduced motion. With a mouse, the button shows on hover, on keyboard focus and while paused;
  touch screens always show it.

## Code

Code blocks sit on the terminal's ink surface in light and dark mode alike, so a command in the docs
looks like the console it runs in. `codeTheme.ts` builds the syntax theme from `tokens.ts`: comments
in the terminal's muted mint, keywords in accent, strings in mint, numbers and constants in signal,
names in cream. Every token color keeps AA against ink. The copy button shows at rest, beside the
language label, and at full strength where there is no hover. On phones, code wraps instead of
scrolling off the screen edge, and a two-column table stacks each row as its name over its value.

## Doc pages

- Every doc page shares one column and one nav position, the parity tracker included. Root pages
  with no docs folder (packages, parity, releases, the brand kit) take their menu section's link
  groups as a sidebar. A section whose overview is a card page takes its sidebar from that page's
  groups, so the sidebar lists every page the overview offers, and the build fails on a page in the
  folder that the overview leaves out.
- Every page ends on the site footer, doc pages beside a sidebar included. The footer carries the
  mark, the wordmark, the server version and the license, beside one link column per audience from
  the guide overview and a Project column (`footer.mts`), so it routes the way the menu does.
- Each second-level section opens on a short solid bar over a display heading; a component's own
  headings (`vp-raw`) draw the same pair themselves, as the parity tracker's do.
  Overview pages whose sections are lists of links set those sections as cards (`sectionCards.ts`),
  on a grid that reads left to right in the page's order, at full width with no outline, since the
  cards are the outline.
- Release notes lead each change with its first sentence in bold. Inline code in them is mono in the
  body color, without a chip, so accent still means a link.
- The parity tracker's rows and group tiles mark anything under
  half passing with a signal square. Its status chips differ by shape as well as color, and only
  defects and failures are filled signal. Group tiles count the behavior checks when a group has
  them and its data-table rows otherwise, and say which with a unit word, so each tile agrees with
  the behavior score the home page shows. On phones the group tiles become one-line rows, so the cases
  follow within a screen.
- The package directory, the API reference index and its sidebar group packages by the areas in
  `packageAreas.ts`; the docs build fails when a published package has no area. The directory is
  where packages are described; the API index lists their names only, as a grid of links, so the two
  pages do different jobs. When every package shares one npm scope, the directory names it once above
  the cards instead of on each.
- Menu and search previews end on a whole sentence where one fits.
- The header's controls (Search, and on phones the Menu button) are controls, not primary actions:
  an edge and no offset shadow.

## The landing page

- The hero says what JSPrismarine is in plain words beside the headline, shows facts the repository
  records (builds, protocol versions, default port, license), and offers one link per audience into
  the tabs below it (`#start-play`, `#start-host` and so on); phones get one line to the tabs.
- Each audience tab is a card that names the audience with its tagline, so all four read before any
  click; one panel shows at a time, headed by what that audience gets.
- The solid accent and signal figure tiles stay: they carry the page's character. Each shows a figure
  the hero does not.
- The page ends on a call to action with a command to copy, plus a line for players and contributors,
  not on decoration. The footer under it routes by audience.

## The menu

The site has one menu, in `tools/docs/site/.vitepress/theme/site-menu/`, drawn from `megaMenus` in
`menus.mts`. It follows these rules at every width:

- **It reads as a menu.** Sections are labeled buttons with a chevron, Search is its own labeled
  button, and phones get a button that says Menu.
- **It grows out of the header.** The header's bottom edge is the panel's top edge. The open section's
  button becomes an ink tab that runs into the panel, and search opens in the header itself.
- **Ink means open.** The tab, the panel, the search field and, on phones, the header turn ink while
  the menu is open, and the panel ends on an accent rule. The dark header is nearly ink already, so in
  dark mode the open menu takes the deep surface instead.
- **You leave where you entered.** Close sits exactly where Menu was, and Esc returns focus to the
  button or field that opened the menu.
- **It shows no key hints.** The menu keeps the keyboard behavior of a disclosure menu, but only
  search, where the keys earn their place, shows a hint row. Shortcut labels follow the platform: ⌘
  on Apple, Ctrl elsewhere, and `/` works on layouts that need Shift for it.
- **It knows where you are.** The current section carries the accent bar, the current page is
  highlighted, and a breadcrumb above the page names both. A section's index page counts as current
  in the first menu that lists pages in its folder, even when no menu links the index itself. When
  the menus link only to sections of the page being read, the first of those links marks it.
- The Guides menu takes its groups and links from the guide overview (`overviewGroups.mts`), as the
  sidebar does, so the menu, the sidebar and the page always name the same audiences.

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
| `AudienceTabs`           | Keyboard-navigable tab cards with a pitch, a snippet and links each. `anchor` gives each panel a linkable id. |
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
