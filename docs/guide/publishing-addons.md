---
title: Publishing addons
description: Release addons from a GitHub repository of your own, with jsp-addon build and JSPrismarine's reusable workflow.
group: Documents
category: Guides
---

# Publishing addons

Any GitHub repository can publish addons the way JSPrismarine publishes its own. The build packs
each addon into an `.mcpack` and writes an index, a workflow attaches both to a GitHub release, and
a server owner installs from it with `addon install <owner>/<repo>/<name>`. This page sets that up.
[Writing an addon](writing-addons.md) covers the addon itself.

## A repository of addons

Put each addon in its own folder under `addons/` at the repository's root, the layout
JSPrismarine's [`addons/`](../../addons/README.md) folder uses. One repository can hold as many
addons as you like:

```text
your-addons/
├── .github/workflows/addons.yml
└── addons/
    ├── tps-bar/
    │   ├── manifest.json
    │   ├── addon.json
    │   ├── README.md
    │   └── scripts/main.js
    └── warps/
        └── ...
```

Files directly under `addons/`, such as a README, are skipped, and so are folders whose names start
with a dot. Every other folder there is an addon, and the build fails if one of them is not valid.

## Build the packs

`@jsprismarine/addon-tools` provides the <!-- fact:addons.cli -->`jsp-addon`<!-- /fact --> command.
`build` reads every addon in the folder, compiles the ones [written in TypeScript](writing-addons.md#write-it-in-typescript),
checks each, packs it into `<name>-<version>.mcpack` and writes
<!-- fact:addons.indexFile -->`index.json`<!-- /fact --> beside the packs:

```bash
npx @jsprismarine/addon-tools build --repository owner/repo
```

The build downloads the index the repository has already published and merges the new packs into
it, so the index keeps every version ever released. A version whose pack is already published with
other contents fails the build. `--offline` skips the download, for a check that needs no network.
These are its options:

<!-- fact:addons.cliUsage -->
```text
Usage: jsp-addon build [options]

Compiles each TypeScript addon (one with a tsconfig.json) with tsc-ts, checks every addon under
the addons folder, packs each into <name>-<version>.mcpack, writes its listing files (README, icon
and screenshots) beside the pack, and writes index.json.

Options:
  --addons <dir>          The folder of addons (default: addons)
  --out <dir>             Where the packs and index.json go (default: dist/addons)
  --repository <o/r>      The GitHub repository whose "addons" release serves the packs
                          (default: $GITHUB_REPOSITORY)
  --base-url <url>        Where the packs download from, in place of the repository's release
  --offline               Skip downloading the published index.json to merge with
  --github-output <file>  Append the release tag, the added packs and their listing files as
                          GitHub step outputs
  --help                  Show this text
```
<!-- /fact -->

The pack holds the addon's files in path order with fixed dates, so the same files always give the
same bytes and the same SHA-256, on any machine. That is what lets the build tell a rebuilt pack
from a changed one.

## Release from GitHub Actions

<!-- fact:addons.workflowPath -->`.github/workflows/addons-release.yml`<!-- /fact --> in
JSPrismarine's repository is a reusable workflow that runs the build and, when asked, attaches the
new packs, their listing files and the index to your repository's
<!-- fact:addons.releaseTag -->`addons`<!-- /fact --> release. Call it from a workflow of your own:

<!-- fact:addons.callerExample -->
```yaml
name: Addons

on:
    pull_request:
    push:
        branches: [main]

# One publish at a time: two at once would each upload an index that lacks the other's packs.
concurrency:
    group: ${{ github.workflow }}-${{ github.ref }}
    cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
    addons:
        uses: JSPrismarine/JSPrismarine/.github/workflows/addons-release.yml@<commit sha>
        permissions:
            contents: write
        with:
            publish: ${{ github.event_name == 'push' && github.ref == 'refs/heads/main' }}
```
<!-- /fact -->

Replace `<commit sha>` with the full SHA of a commit on JSPrismarine's `master`, so a later change
to the workflow reaches your releases only when you move the pin. A pull request only builds,
which catches an invalid addon, or a changed pack whose version is already published, before it
merges. A push to `main` also publishes.

The workflow takes these inputs:

<!-- fact:addons.workflowInputs -->
| Input          | Type    | Default  | What it does                                                                                                                                                                         |
| -------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `addons`       | string  | `addons` | The folder that holds one folder per addon.                                                                                                                                          |
| `tools`        | string  | `latest` | The `@jsprismarine/addon-tools` version to run, such as `latest` or `0.23.0`. `workspace` runs the package from the caller's checkout, which only JSPrismarine's own repository has. |
| `node-version` | string  | `lts/*`  | The Node.js version to run a published `@jsprismarine/addon-tools` on.                                                                                                               |
| `publish`      | boolean | `false`  | Whether to attach the new packs, their listing files and the index to the `addons` release.                                                                                          |
<!-- /fact -->

Set `tools` to an exact version to keep the build the same from one release to the next; the
default runs whatever version npm has as latest.

When the repository has a `package-lock.json`, the workflow runs `npm ci` before the build, so a
TypeScript addon finds the typings its `package.json` names.

The publish job runs only when the build added a pack the release lacks. It creates the release
the first time, not marked as the repository's latest, uploads each new pack, and then uploads the
index in place of the old one. The packs go up first, so the index never names a pack the release
doesn't have yet. It never replaces a pack already on the release. A run that fails partway can
leave some packs up while the index still lacks them; the next run skips each of those whose
SHA-256 matches the build's and fails on one with other contents.

The `concurrency` group matters. Two publishes at once would each merge their packs into the index
they downloaded, and the second upload would drop the first one's entries.

## Versions are permanent

Once a version is on the release, its pack never changes. A server's `addons.lock.json` records
the pack's URL and SHA-256, and a server copied to a new machine downloads that exact pack again
and refuses one that no longer matches. Changing a published pack, or deleting it from the release,
breaks every server locked to it.

So every change to an addon needs a new version. Raise `version` in the manifest's header and in
each of its modules. The build fails for an addon whose version is already published with other
contents, which catches a forgotten bump on the pull request.

Owners install with a range, `^` and the version by default, and `addon update` moves them within
it. Choose the next version the way npm packages do, so their ranges work:

- Raise the patch, `1.0.1`, for a fix.
- Raise the minor version, `1.1.0`, for something new that keeps working the way it did.
- Raise the major version, `2.0.0`, when an owner has to change something, such as a renamed
  command or a removed setting. Servers on `^1.0.0` stay on `1.x` until their owner moves.

Raise `minServer` in `addon.json` when a version starts to need a newer JSPrismarine. A server
older than it keeps the last version it can run, since an install and an update pick the newest
version in range whose `minServer` the server meets.

## The index

The release carries <!-- fact:addons.indexFile -->`index.json`<!-- /fact --> beside the packs.
Schema version <!-- fact:addons.indexSchemaVersion -->`1`<!-- /fact --> lists every published version
of every addon, sorted by name and then by version, oldest first:

<!-- fact:addons.indexExample -->
```json
{
    "schemaVersion": 1,
    "addons": [
        {
            "name": "tps-bar",
            "version": "1.0.0",
            "description": "Shows TPS, MSPT and ping on a boss bar.",
            "minServer": "0.24.0",
            "url": "https://github.com/JSPrismarine/JSPrismarine/releases/download/addons/tps-bar-1.0.0.mcpack",
            "sha256": "<the pack's SHA-256>"
        },
        {
            "name": "tps-bar",
            "version": "1.1.0",
            "description": "Shows TPS, MSPT and ping on a boss bar.",
            "minServer": "0.24.0",
            "url": "https://github.com/JSPrismarine/JSPrismarine/releases/download/addons/tps-bar-1.1.0.mcpack",
            "sha256": "<the pack's SHA-256>"
        }
    ]
}
```
<!-- /fact -->

Each entry has the addon's name and version, the `description` and `minServer` from its
`addon.json`, where the pack downloads from, and the pack's SHA-256 in lowercase hexadecimal. A
version built with listing support also has a `listing`: its title, tags, authors and license, any
deprecation, and the URL and SHA-256 of its README, icon and screenshots, which the release carries
beside the pack. The build writes the file, so you never edit it. `@jsprismarine/addon-tools/addonIndex` reads and
writes it for tools of your own; [its README](../../packages/addon-tools/README.md#the-index) lists
the functions.

## How owners install from you

An owner names your repository and the addon on the console:

```text
addon install owner/repo/tps-bar
```

The server reads the index from <!-- fact:addons.indexUrl -->`https://github.com/<owner>/<repo>/releases/download/addons/index.json`<!-- /fact -->,
picks the newest version that runs on it, checks the download against the index's SHA-256 and
records your repository as the addon's source. Two repositories can each publish an addon of the
same name; an owner who wants both installs the second under another name with `as`.
[Installing addons](installing-addons.md) covers the rest of what owners do.

`addon install` reads indexes from GitHub releases only. A pack you host elsewhere still installs
by its `https:` URL, but with no index the server has no hash to check the first download
against. `--base-url` points a build's index at another host for tools of your own.

## List it in the marketplace

Owners find addons in the [marketplace](../addons/README.md) on jsprismarine.dev. Once your addon
publishes, [Listing an addon](listing-addons.md) takes it to a page there: a title, tags, an icon and
screenshots in the addon's folder, and a pull request that adds your repository to
<!-- fact:addons.listingsFile -->`addons/listings.json`<!-- /fact -->.
