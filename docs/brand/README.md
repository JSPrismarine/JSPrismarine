# Brand

How JSPrismarine looks and sounds. The docs site implements this guide, and the
[brand kit](https://jsprismarine.github.io/JSPrismarine/brand-kit) renders every color, the mark and
each component live from the same source.

| What                     | Where                                         |
| ------------------------ | --------------------------------------------- |
| Palette                  | `tools/docs/site/.vitepress/theme/tokens.ts`  |
| Mark geometry            | `tools/docs/site/.vitepress/theme/prism.ts`   |
| Derived shades and sizes | `tools/docs/site/.vitepress/theme/brand.css`  |
| Components               | `tools/docs/site/.vitepress/theme/components/` |
| Project facts            | `tools/docs/site/project.data.mts`            |

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

The accent is `#5ca48a`, shared with the JSPrismarine website. Every other color supports it.

| Token          | Hex       | Use                                                      |
| -------------- | --------- | -------------------------------------------------------- |
| `--jsp-accent` | `#5ca48a` | Primary accent: buttons, highlights, active states.      |
| `--jsp-forest` | `#003829` | Dark brand surface and light-mode link color.            |
| `--jsp-deep`   | `#00281d` | Darkest surface: tile backgrounds and shadows.           |
| `--jsp-mint`   | `#a9d9c6` | Body text on forest and the light facet of the mark.     |
| `--jsp-cream`  | `#efe9da` | Light surface and text on dark.                          |
| `--jsp-ink`    | `#0b1713` | Text on light and the terminal surface.                  |
| `--jsp-signal` | `#ff6b3d` | Spot color for prompts, cursors and the core of the mark. |

`tokens.ts` is the authority for these values. The site config writes them into the page head as the
`--jsp-*` custom properties and builds the favicon from them, and `brand.css` mixes the supporting
shades (terminal chrome, progress tracks, page backgrounds) from them with `color-mix`. If this table
and `tokens.ts` disagree, `tokens.ts` wins and this table is out of date.

Rules:

- Surfaces are flat. No gradients, glows, blurs or translucent glass.
- Signal orange marks small things: a prompt, a cursor, the core of the mark, a focus ring. A page
  may also use it for one solid block. It is never a link color and never a body text color.
- Text on `--jsp-accent` is `--jsp-forest`. Text on `--jsp-signal` is `--jsp-ink`.
- Keep body text at WCAG AA contrast or better against its surface.

## Type

| Role    | Family              | Weights  | Notes                                 |
| ------- | ------------------- | -------- | ------------------------------------- |
| Display | Bricolage Grotesque | 500, 800 | Tight tracking (`-0.04em` and below). |
| Mono    | JetBrains Mono      | 400, 700 | Commands, labels, logs and code.      |

Headlines are set heavy and tight, in sentence case, and are allowed to be very large. Small labels
are mono, uppercase and letter-spaced. System fonts are the fallback when the web fonts do not load.

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
- Every control shows a signal-orange focus ring when reached by keyboard.
- Motion is short and mechanical. Honor `prefers-reduced-motion` by stopping tickers and cursors.

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
| `BrandButton`            | Primary and outline buttons with the hard shadow.                 |
| `TerminalWindow`         | A server console frame. Each `t-line` span in the slot is a line. |
| `AudienceTabs`           | Keyboard-navigable tabs with a pitch, a snippet and links each.   |
| `BentoGrid`, `BentoTile` | Solid color tiles for short claims or figures.                    |
| `ParityBars`             | The behavior parity score and bars, counted as the tracker counts. |
| `CopyButton`             | Copies a command to the clipboard.                                |
| `Ticker`                 | A looping banner of short phrases.                                |

## Content comes from the repository

The landing page states no fact that the repository already records. `project.data.mts` reads these
at build time:

- the server version;
- the published packages;
- the Node and pnpm requirements;
- the supported protocols and Minecraft releases;
- the default port and online mode.

The build fails when a command, package or source pattern the page relies on disappears. The terminal
preview uses the server's real startup log lines. `ParityBars` reads the tracker snapshot and shows
the gameplay behavior score that the parity tracker page leads with, not the data-table pass rate.
To add a claim to the page, add it to the loader rather than typing the value into a component.

## Changing the brand

Change a color in `tokens.ts`, a shape in `prism.ts`, and a derived value in `brand.css`, never a hex
value in a component. Update this guide in the same commit when a token, font or rule changes.
