# Addon marketplace

Status: proposed, 2026-11-21.

The Addons section lists JSPrismarine's own addons, one Markdown section each. This plan turns it
into a marketplace: one searchable page of every listed addon, JSPrismarine's and other people's,
and a page per addon built from its README, icon and screenshots. Anyone can get listed by
adding their repository to a JSON file in a pull request.

## What changes for whom

| Who                | Today                                                    | After                                                                                    |
| ------------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Server owner       | Reads one list of first-party addons.                    | Searches and filters every listed addon, copies the install command from the page.      |
| Addon author       | Publishes an index nobody can find without the repo URL. | Adds listing fields to `addon.json` and one line to `addons/listings.json`.              |
| Older servers      | Read `index.json` schema 1.                              | Still do: the new fields are optional, and the parser already drops keys it doesn't know. |

## Decisions

### Page content travels in the addon format

The listing comes from the addon itself, so it is versioned and hashed with the pack it describes,
and the site never holds a second copy that can drift.

`addon.json` gains optional fields:

```json
{
    "description": "Shows TPS, MSPT and ping on a boss bar.",
    "minServer": "0.23.0",
    "license": "(MIT OR MPL-2.0)",
    "title": "TPS Bar",
    "tags": ["performance"],
    "authors": ["JSPrismarine"],
    "screenshots": [{ "file": "media/bar.png", "alt": "The bar at an idle server, all green." }]
}
```

- `title` defaults to the README's first heading, then the manifest header's `name`.
- `tags` come from a fixed list that `@jsprismarine/addon-tools` owns (`admin`, `chat`, `gameplay`,
  `performance`, `world` to start). A fixed list keeps the filters useful; free-form tags fragment.
- The icon is the pack's `pack_icon.png`, the file Bedrock already reads. No new field.
- The page body is the addon's `README.md`, which every addon already has.
- `media/` holds the screenshots. The build leaves that folder out of the `.mcpack`, so a server
  never downloads images it cannot show.

`jsp-addon build` writes the listing files beside each pack, the release workflow uploads them, and
each index entry gains an
optional `listing`:

```json
{
    "name": "tps-bar",
    "version": "1.0.2",
    "description": "Shows TPS, MSPT and ping on a boss bar.",
    "minServer": "0.23.0",
    "url": "https://github.com/JSPrismarine/JSPrismarine/releases/download/addons/tps-bar-1.0.2.mcpack",
    "sha256": "…",
    "listing": {
        "title": "TPS Bar",
        "license": "(MIT OR MPL-2.0)",
        "tags": ["performance"],
        "authors": ["JSPrismarine"],
        "readme": { "url": "…/tps-bar-1.0.2.md", "sha256": "…" },
        "icon": { "url": "…/tps-bar-1.0.2.png", "sha256": "…" },
        "screenshots": [{ "url": "…/tps-bar-1.0.2-1.png", "sha256": "…", "alt": "…" }]
    }
}
```

The schema version stays 1: `parseAddonIndex` drops keys it does not know, so every server that
reads indexes today keeps working. The publisher rewrites the index on each release, so
`parseAddonIndex` reads and checks `listing` as part of the schema, and the merge keeps each
published entry's `listing` as it was. A published version's listing is as fixed as its pack:
`mergeAddonIndex` compares the hashes of a rebuilt version's listing files as well as its pack's,
and refuses one whose files differ. Versions published before this change have no `listing`, and
the site falls back to the entry's description. A repository that pins tools older than this
change drops published listings when it rewrites its index, so Listing an addon asks for a version
that has them.

### Listing is a pull request to one file

`addons/listings.json` names the other repositories the site lists, and which of their addons:

```json
{
    "listings": [{ "repository": "acme-mc/bedrock-addons", "addons": ["warps", "afk-kick"] }]
}
```

Naming each addon means a repository's next addon is not listed until someone reviews its pull
request. JSPrismarine's own addons need no entry; the site reads them from `addons/` as it does
now. The review checks that the addon is what its listing says and is not spam. Nobody reviews the
scripts, and the pages say so.

### The site builds from a checked-in snapshot

The docs build must not depend on other people's servers being up. `pnpm run addons:listings`
fetches each listed repository's index, picks the newest version of each listed addon, verifies the
listing files against their hashes and writes `addons/listings.lock.json`: per addon, the newest
version's index entry with every listing file's URL and SHA-256, and the version, `minServer` and
pack SHA-256 of every published version, which the page's version list shows. The docs build reads the lock, downloads
the pinned files into the shared cache and checks each hash. A file that has gone away or changed
leaves that addon's page without it, with a warning, instead of failing the deploy.

A daily workflow reruns the snapshot and opens a pull request when it changed, which merges itself
once its checks pass, the way the native library's manifest pull request does. The pull request
records each change in the history; nobody has to approve it. Listing a new addon still takes a
reviewed pull request to `listings.json`. The refresh only moves addons that are already listed.

### Deprecated addons

A deprecated addon stays listed, but its pages steer people away from it, and the console does when
its author deprecated it. Nothing removes a listing on its own.

An addon becomes deprecated in one of three ways:

| Who            | How                                                                                 | Reason shown                                   |
| -------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------- |
| Its author     | `"deprecated": "Use warps-plus instead."` in `addon.json`, in a new version.        | The author's text.                              |
| A maintainer   | `"deprecated": "…"` on the addon in `listings.json`, in a reviewed pull request.     | The maintainer's text.                          |
| The snapshot   | Its repository is archived, or its release has been gone for seven daily refreshes. | "Its repository is archived.", and so on.       |

An author can also name a replacement with `"replacedBy": "warps-plus"`, an install id, and the
pages link to it. When the snapshot can no longer download an addon's files, it keeps the text
fields it last saw in the lock, so the page still renders, without the README and the images.

What a deprecated addon looks like:

- The marketplace hides deprecated addons behind a "Show deprecated" filter, and sorts them after
  the others when shown. Each card says "Deprecated" in place of the version.
- Its page opens with a notice on a signal rule giving the reason and the replacement. The band's
  copy button becomes a secondary button, so it no longer looks like the thing to press.
- `addon install` and `addon update` print the author's reason as a warning. Neither refuses: an
  owner who needs the addon can still have it. `addon list` marks it. The installer reads the field
  from the index entry's `listing`, so servers older than this change install it without the
  warning. A server reads only the publisher's index, so a maintainer's or the snapshot's
  deprecation shows on the site alone: a server never downloads the marketplace's files.

### Third-party content is rendered as data

- READMEs render with raw HTML off. Links get `rel="ugc nofollow noopener"`. Only relative links
  and `http:`, `https:` and `mailto:` links stay clickable. Any other scheme, such as
  `javascript:`, `data:` or `vbscript:`, renders as plain text.
- Images show only from the pinned listing files. Any other image in a README becomes a link.
- The README's first heading is dropped, since the page title replaces it. Its other headings
  shift down a level to sit under the page's `h1`.
- Each community page carries the "Listed, not reviewed" notice and names its repository wherever
  the install command appears.

## Pages

Mockups: the marketplace index and an addon page, with JSPrismarine and community variants, in
light, dark and phone layouts.

### `/addons/`: the marketplace

- Heading and one line on what an addon is, linking to Installing addons.
- The page's one full-width band is a console line, `> addon install ▍`. Typing filters the cards.
  When one addon is left, Tab completes its install id and Enter copies the whole command, so the
  search field and the command a reader leaves with are the same thing.
- Filters: publisher (everyone, JSPrismarine, community) and tags, with counts, and "Show
  deprecated", off by default.
- One card per addon: icon, title, publisher, description, install id and version. An addon that
  needs a newer server than the current release shows "Needs 0.24.0" in place of its version.
- A standing line above the cards says community addons are listed, not reviewed.
- "List your addon here" ends the page, with the `listings.json` diff and a link to the guide.

### `/addons/<id>`: one addon

The URL is the install id: `/addons/tps-bar`, `/addons/acme-mc/bedrock-addons/warps`.

- Icon, title, description, publisher, source link and tags.
- The band: the full install command with Copy, then version, the oldest server it runs on, and
  license.
- Community pages: the "Listed, not reviewed" notice under the band.
- Deprecated pages: the deprecation notice above the band, and a secondary copy button.
- Screenshots, then the README.
- A side rail with the publisher, release date, pack SHA-256, every published version, how to pin
  one with a range, and where to report problems.
- Structured data: a `SoftwareApplication` per addon, from the same fields.

### Guides

A new guide, **Listing an addon** (`docs/guide/listing-addons.md`), takes an author from a
published addon to a page in the marketplace:

1. What a listing is: what the marketplace shows, what the review checks, and what "Listed, not
   reviewed" means for the people installing it.
2. Before you start: the addon publishes from a repository's `addons` release
   ([Publishing addons](../guide/publishing-addons.md)), and has a license.
3. Fill in the listing: `title`, `tags` from the fixed list, `authors`, `pack_icon.png` and its
   size, screenshots under `media/` with alt text, and a README written for the page.
4. Release a version, since a listing is fixed per version, and check the index entry's `listing`.
5. Open the pull request to `addons/listings.json`, with the review checklist the pull request
   template asks for.
6. After it merges: how the daily refresh picks up new versions, how long that takes, and where the
   page lives.
7. Deprecating an addon, naming a replacement, and asking for a listing to be removed.

The guide's field list and tag list are docs facts generated from `@jsprismarine/addon-tools`, so
they cannot drift from what the build accepts. The marketplace's "List your addon here" section and
the pull request template link to it.

Other guides:

- Publishing addons links to Listing an addon from its last step.
- Writing an addon documents the new `addon.json` fields.
- Installing addons links to the marketplace in place of "JSPrismarine does not list other people's
  addons", and explains the deprecation warning.

## Slices

1. **Listing fields in the addon format** (`@jsprismarine/addon-tools`). Parse and check the new
   `addon.json` fields, `deprecated` and `replacedBy` included, and the tag list. Leave `media/` out
   of the pack. Write the listing files and the entry's `listing` beside the pack, and hold them to
   the same no-change rule as the pack in `mergeAddonIndex`. Unit tests, including a schema-1
   reader that ignores `listing`. Errors go in the addon-tools catalog. Changeset.
2. **The release workflow uploads listing files.** `addons-release.yml` attaches them beside the
   packs. Count the jobs per push; this should add a step, not a job.
3. **TPS Bar's listing, with our own screenshot.** Take the screenshot from the cinnabar client on a
   JSPrismarine server with a flat world, under `xvfb-run`, with the bar at green, gold and red, and
   put it in `addons/tps-bar/media/`. It replaces `docs/plans/first-party-addons-tps-bar.png`, a
   capture from another server, everywhere it is used. Add `pack_icon.png`, `title` and `tags`,
   and bump the addon's version.
4. **Deprecation warnings in the console** (`@jsprismarine/prismarine`). `addon install` and
   `addon update` warn with the reason and the replacement, and `addon list` marks deprecated
   addons. Unit tests on the command's output. Changeset.
5. **Listings file and snapshot.** `addons/listings.json` with its JSON schema and maintainer
   `deprecated` field, `addons:listings` and `listings.lock.json` with the snapshot's own
   deprecations, a CI check that the lock matches the listings file, a pull request template for
   listing requests, and the daily refresh workflow with auto-merge.
6. **Marketplace pages.** An `AddonMarket` component for the index and generated addon pages from
   the lock and `addons/`, with README rendering, deprecated states and the `SoftwareApplication`
   data as above. Register the component in the brand catalog. Check the pages in light, dark and
   at 390 px.
7. **Guides.** The new Listing an addon guide, and the publishing, writing and installing guides,
   as above. Add the docs facts the guides need.

## Decided

- The daily refresh pull request merges itself once its checks pass (2026-11-21).
- No `addon search` console command for now (2026-11-21).
- Nothing removes a listing automatically. Archived or vanished addons become deprecated instead
  (2026-11-21).
