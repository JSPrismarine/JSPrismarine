# llms.txt for the docs site

Written 2026-11-21 on `docs/llms-txt-plan`. Phases 1 to 3 are built. [What we know](#what-we-know)
records how the docs build works today, [Design](#design) proposes what to publish and how to
generate it, and [Decisions](#decisions) records what the maintainer settled on 2026-11-21.

## Goal

Give language models and the tools built on them a way to read jsprismarine.dev as Markdown, without
scraping the rendered HTML. Generate every file from the same staged pages and project data the site
already builds from, so the files never need editing by hand and never drift from the site.

## What we know

### The llms.txt format

The [llms.txt proposal](https://llmstxt.org/) asks for a Markdown file at `/llms.txt` on the site's
root with, in order:

1. An H1 with the project's name. This is the only required part.
2. A blockquote with a short summary.
3. Optional paragraphs or lists with more context, and no headings.
4. H2 sections, each a list of `- [Title](url): notes` links.
5. An H2 section named `Optional`, whose links a reader may skip when it needs a short context.

The proposal also asks sites to serve each page as Markdown at the page's URL with `.md` appended,
and many sites publish a second file, `/llms-full.txt`, with the text of every linked page in one
file. Neither is part of the core format, but both are common: tools that fetch one URL want the full
file, and tools that browse want the per-page Markdown.

### How the docs build works

- `tools/docs/assemble.mts` stages each published page from `docs/<section>/` and the root
  documents into `tools/docs/site/`. Staging fills every docs fact with its current value, rewrites
  relative links to site-absolute routes, and drops the files a section marks `unpublished`. The
  staged Markdown is the right text for a model: it is current and its links work.
- `tools/docs/sections.mts` already reads a page's title (`pageTitle`) and its summary
  (`pageSummary`, from the `description` front matter or the first sentence), and maps a page to its
  route (`pageRoute`, `pageUrl`). The section indexes, the search index and the link preview cards
  use these, so llms.txt can too.
- `overviewGroups` reads the groups of a section's overview page, such as the guide's "Play" and
  "Host a server". The site menu and the sidebar use them.
- `loadProject()` lists the published packages with their descriptions, and `code-data.mts` loads
  the commands, settings and errors from the code.
- `docs:api` writes the API reference as Markdown under `site/api/` with `typedoc-plugin-markdown`.
- `buildEnd` in `site/.vitepress/config.mts` writes `robots.txt` and `_headers` into the built site
  after VitePress renders it. The site is served by Cloudflare Pages at the root manifest's
  `homepage`.
- Some pages are Vue components with no Markdown body: the landing page, the addon marketplace and
  each addon page, Packages, Parity, Benchmarks, Releases and Contributors. Their content comes from
  JSON data that the build already loads.

### Size

Measured on 2026-11-21 from the Markdown under `docs/`:

| Content                    | Files | Bytes |
| -------------------------- | ----: | ----: |
| Guides and data-driven     |    29 |  560k |
| Errors                     |    53 |  460k |
| Decisions and plans        |    56 |  1.1M |
| Research                   |    61 |  5.1M |

At roughly four bytes per token, the guides and data-driven pages alone are about 140k tokens.
Plans and research are dated records, not documentation of the current code, and are ten times as
large.

## Design

### Files

Publish four kinds of file, all at the site's root or beside the page they mirror:

| URL                       | What it holds                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| `/llms.txt`               | The index in the llms.txt format, linking each page's Markdown.                                    |
| `/llms-full.txt`          | The full text of the guides, data-driven pages, addons and the root documents.                     |
| `/<route>.md`             | Each page as Markdown. A folder's index is `/<folder>/index.md`, so `/guide/` is `/guide/index.md`. |
| `/api/llms.txt`           | An index of the API reference by package, linking each package's TypeDoc Markdown.                |

The API reference gets its own index because it is large and only someone writing code against a
package needs it. `/llms.txt` links it from its `Optional` section.

### What `/llms.txt` contains

```markdown
# JSPrismarine

> <the root package.json description>

- <the version and license, the Minecraft releases the server accepts, the platforms the prebuilt
  executables cover and the Node.js version, and the demo server's address, from loadProject()>

## Play
## Host a server
## Build add-ons and plugins
## Work on JSPrismarine
<the guide overview's groups, each a section with the overview's links and descriptions>

## Addons
## Errors
## Data-driven engine
<each section in sections.mts order, its pages in its sidebar's order>

## Packages
<each published package in its package area's order: its API reference, with its manifest description>

## Optional
- [API reference](/api/): ...
- <each page of the sections marked optional: brand, decisions, plans and research>
- <every other page: the section overviews no group links, Packages, Parity, Contributing and so on>
```

Each link's text is the page's title from `pageTitle` and its note is the page's summary from
`pageSummary`, the same text the section index cards show. A guide overview link keeps the
overview's own text and description. Links are absolute URLs under the site's `homepage`, since a
reader of the file may have fetched it without the site around it.

`sections.mts` marks a section `optional` to list it under `Optional`, and `dated` to label its
pages. A page appears in the first place that lists it, so a data-driven page a guide group links is
not listed again under the data-driven engine. Every page except the landing page and the API
reference's own pages appears exactly once.

Decisions, plans and research appear in `Optional` with a link per page, each labeled with when it
was written or whether it still holds. They describe the code as it was when each was written, so a
model that reads them as current documentation gives wrong answers, but an agent working on the
repository often needs one by name. The label tells it how old the page is:

- A plan or research note carries the verb and date `pageDate` reads from its opening sentence, such
  as "Written 2026-11-12. Report pseudonymous usage statistics ...".
- A decision carries the `Status:` line it opens with, such as "Status: accepted, 2026-11-15".
- A page with neither carries the date its source last changed in git, such as "Updated
  2026-11-02". On 2026-11-21 that was 19 plans and research notes, whose opening sentences say what
  they cover rather than when.

### What `/llms-full.txt` contains

The Markdown copy of every page `/llms.txt` links outside `Optional`, Packages and the sections
`sections.mts` marks `lookup` (the errors), in the same order, each page once and under a block
giving its URL:

```markdown
---
url: https://jsprismarine.dev/guide/running
---

# Running JSPrismarine
...
```

That keeps it near the size of the guides and data-driven pages, about 140k tokens. Errors stay out
because a model looking up an error needs one page, which the per-page Markdown serves, and 460 kB of
error catalog would crowd out the guides for a reader with a smaller context.

`FULL_TEXT_BUDGET` in `llms.mts` caps the file at 800,000 bytes, about 200k tokens. The build fails
when the file would be larger, and says to split a section off or move one to `Optional`.

### Turning a page into Markdown for a model

The per-page files and `llms-full.txt` use the staged Markdown, through `pageMarkdown` in
`tools/docs/llms.mts`. Staging has already filled the docs facts and taken their markers out, and the
staged pages use no VitePress containers, since they are written for GitHub. `pageMarkdown` makes
two changes:

- Remove the front matter. Its `title` becomes the H1 when the page has none, and its
  `description` the paragraph under the title when the page has no opening paragraph.
- Turn site-absolute and relative links into absolute URLs, pointing at the `.md` file when the
  target is a page that has one, and keep the anchor. A link to a heading on the same page stays as
  written.

A page built from a Vue component gets a Markdown body written from the data the component renders:

- Packages: each package's name, description, version, npm link and README link, from
  `loadProject()`.
- Addon pages and the marketplace: the addon's README text and its install command, from
  `buildMarket`'s output.
- Releases: the release list from `releases.data.mts`.
- Parity and Benchmarks: their headline numbers and a link to the page. The tracker's case data and
  the benchmark history are too large and too detailed to be useful as text.
- The landing page and Contributors get no Markdown page, and `/llms.txt` does not link them.

### Where the code goes

A module `tools/docs/llms.mts` with the functions above and a test file beside it,
`tools/docs/llms.test.ts`. It runs from `buildEnd` in the VitePress config, next to `robots.txt`,
since by then both the staged pages and the API Markdown exist and `siteConfig.pages` lists every
page VitePress built. Reading the page list from VitePress, rather than from `docs/`, means a page
added to any section, or left `unpublished`, is listed or left out without changing `llms.mts`.

`buildEnd` also:

- Adds `Content-Type: text/markdown; charset=utf-8` for `/*.md` to `_headers`, since Cloudflare
  Pages would otherwise serve them as a download or as `application/octet-stream`.
- Adds a `<link rel="alternate" type="text/markdown" href="<page>.md">` to each page's `<head>`
  through `transformPageData`, so a tool on an HTML page can find its Markdown.

The site footer gets a link to `/llms.txt`.

### Tests

`llms.test.ts`, run by the docs package's `test` script, checks the generated files against the
staged site:

- Every page outside the landing page and the API reference's own pages is linked from `/llms.txt`
  exactly once, and every link to a staged page names its Markdown copy.
- Every decision, plan and research link carries its date, status or last change.
- No generated Markdown contains a fact marker, front matter, a VitePress container or a
  site-absolute link.
- `/llms.txt` parses as the format asks: one H1, a blockquote, H2 sections of links.
- `/llms-full.txt` holds each documentation page once, in order, and leaves out lookup sections and
  `Optional`.
- A full text over `FULL_TEXT_BUDGET` fails the build rather than being written, so a section that
  grows past what a model can read stops the build and the maintainer decides what to move.

The test uses a small staged site as a fixture rather than the full build, so it runs in the docs
package's `test` script without TypeDoc or the parity suite.

### Docs

Add a short section to the contributing guide's docs part saying the files exist and that they are
generated, so nobody edits a checked-in copy. There is no checked-in copy: the files exist only in
the built site.

## Phases

1. Done: `llms.mts` with the page-to-Markdown function and per-page `.md` files for the staged
   sections, the `_headers` entry and the tests for them.
2. Done: `/llms.txt` from the sections, overview groups and packages, and the footer link.
3. Done: `/llms-full.txt` with its byte budget.
4. Markdown bodies for the component pages: Packages, addons, Releases, Parity and Benchmarks.
5. `/api/llms.txt` from TypeDoc's sidebar and package Markdown.
6. The `<link rel="alternate">` head entry.

Each phase is one pull request, and each leaves the site working with what it adds.

## Decisions

Settled by the maintainer on 2026-11-21.

### Plans, research and decisions are listed page by page under `Optional`

Each link carries its page's date or status, as [Design](#design) describes.
An agent working on the repository often needs a particular plan or ADR, and a link to a section
index costs it a fetch it may not make. The date answers the risk that a model reads an old plan as
the current design, and a reader that skips `Optional` never sees them.

### Errors stay out of `/llms-full.txt`

An error lookup starts from a code or a message, and the error's page answers it in one fetch.
The catalog would add about 115k tokens and nearly double the full file, which a model with a smaller
context pays for in guides it can no longer read. `/llms.txt` still links every error page.

### No per-section full files until the byte budget trips

The full file is about 140k tokens, which fits the context of the models most tools use. When the
budget fails the build, splitting the full file by section, such as `/guide/llms-full.txt`, is the first
fix to consider, before moving pages to `Optional`.

### No `Accept: text/markdown` negotiation for now

Answering a page's normal URL with Markdown needs a Pages Function, which runs on every request to the
site, static files included, and adds a runtime to deploy, test and watch. The `.md` URLs, the
`<link rel="alternate">` entry and `/llms.txt` already lead a tool to the Markdown. Revisit it if
Cloudflare offers Markdown for agents on Pages without code, or if the site's logs show tools asking
for Markdown at page URLs.
