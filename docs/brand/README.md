# Brand

How JSPrismarine looks and sounds. The docs site implements this page; the tokens below live in
`tools/docs/site/.vitepress/theme/brand.css` and the reusable pieces in `theme/components/`.

## Position

JSPrismarine is the Bedrock server you run, own and build on. It is a product people choose, not a
library index. The brand is flat, bold and direct: big type, solid color blocks, hard edges, and real
commands and numbers in place of decoration.

Four audiences use the site, and every page should make clear which one it serves:

| Audience     | Wants                               | Entry point |
| ------------ | ----------------------------------- | ----------- |
| Players      | Join a server and know what works   | Play        |
| Hosts        | Install, configure and operate it   | Host        |
| Add-on devs  | Data packs, plugins and the API     | Build       |
| Contributors | Clone, change, test and ship        | Contribute  |

## Color

The accent is `#5ca48a`, shared with the JSPrismarine website. Every other color supports it.

| Token             | Hex       | Use                                                   |
| ----------------- | --------- | ----------------------------------------------------- |
| `--jsp-accent`    | `#5ca48a` | Primary accent: buttons, highlights, active states.   |
| `--jsp-forest`    | `#003829` | Dark brand surface and light-mode link color.         |
| `--jsp-deep`      | `#00281d` | Darkest surface, shadows and ground lines.            |
| `--jsp-mint`      | `#a9d9c6` | Body text on forest, light facets.                    |
| `--jsp-cream`     | `#efe9da` | Light surface and text on dark.                       |
| `--jsp-ink`       | `#0b1713` | Text on light, terminal surface.                      |
| `--jsp-signal`    | `#ff6b3d` | Signal orange. Rare: one small spot per view.         |

Rules:

- Surfaces are flat. No gradients, glows, blurs or translucent glass.
- Signal orange marks a single thing, such as a prompt, a cursor or the prism's core. Never use it for
  large fills of body UI, and never for links.
- Text on `--jsp-accent` is `--jsp-forest`. Text on `--jsp-signal` is `--jsp-ink`.
- Keep body text at WCAG AA contrast or better against its surface.

## Type

| Role    | Family                | Weights  | Notes                                  |
| ------- | --------------------- | -------- | -------------------------------------- |
| Display | Bricolage Grotesque   | 500, 800 | Tight tracking (`-0.04em` and below).  |
| Mono    | JetBrains Mono        | 400, 700 | Commands, labels, logs and code.       |

Headlines are set heavy and tight, in sentence case, and are allowed to be very large. Small labels
are mono, uppercase and letter-spaced. System fonts are the fallback when the web fonts do not load.

## Mark

The mark is a prism: an isosceles triangle cut into three flat facets (`--jsp-accent` left,
`--jsp-mint` right, `--jsp-forest` base) with a small `--jsp-signal` triangle at its core.

- Use `PrismMark` from the theme rather than redrawing it.
- Keep clear space of half the mark's width on every side.
- Do not rotate, outline, add shadows or recolor the facets. On a forest surface, swap the forest
  base facet for `--jsp-deep`.
- The wordmark is `JSPrismarine`, one word, camel case, in Bricolage Grotesque 800.

## Shape and motion

- Corners are rounded to `14px` on panels and `10px` on controls. Pills are fully round.
- Primary actions carry a hard offset shadow (`4px 4px 0`, no blur) that collapses on press.
- Grids are tight: `10px` gaps between solid blocks.
- Motion is short and mechanical. Honor `prefers-reduced-motion` by stopping tickers and cursors.

## Voice

- State what the thing does. "One binary to host it." beats "A powerful solution for hosting."
- Prefer real commands, file names and numbers over adjectives. If a number is a sample, label it.
- Address the reader directly and keep sentences short.
- American English, sentence case headings, no exclamation marks, no emoji.

## Components

The docs theme exposes the brand as Vue components registered globally, so any page that allows HTML
can use them. Pages staged from `docs/` render as plain Markdown, so use them from site-owned pages
such as `tools/docs/site/index.md`.

| Component       | Purpose                                                       |
| --------------- | ------------------------------------------------------------- |
| `PrismMark`     | The prism logo as inline SVG, any size.                       |
| `BrandButton`   | Primary and outline buttons with the hard shadow.             |
| `TerminalWindow`| A server-console frame. Lines are passed through the slot.    |
| `AudienceTabs`  | Tabs that swap a pitch, a snippet and links per audience.     |
| `BentoGrid`, `BentoTile` | Solid color tiles for short claims or data.         |
| `ParityBars`    | Horizontal bars from the parity tracker data.                 |
| `Ticker`        | A looping banner of short phrases.                            |

## Content comes from the repository

The landing page states no fact that the repository already records. `tools/docs/site/project.data.mts`
reads the version, package list, Node and pnpm requirements, supported protocols and default port at
build time, and fails the docs build when a command or package the page shows disappears. The startup
preview uses the server's real log lines, and the parity bars read the tracker snapshot. Add a new
claim to the page by adding it to that loader, not by typing the value into a component.

## Changing the brand

Change a token in `brand.css`, not a hex value in a component. Update this page in the same commit
when a token, font or rule changes.
