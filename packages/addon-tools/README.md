# @jsprismarine/addon-tools

[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/kZZCDyCBbW)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/addon-tools)](https://www.npmjs.com/package/@jsprismarine/addon-tools)

Builds JSPrismarine addons. `jsp-addon build` checks every addon in a folder, packs each one into
`<name>-<version>.mcpack`, and writes the index a JSPrismarine server installs addons from.
JSPrismarine builds [its own addons](https://github.com/JSPrismarine/JSPrismarine/tree/master/addons)
with it, and any GitHub repository can publish addons the same way.

## An addon

An addon is a behavior pack in a folder named for the addon, such as `addons/tps-bar/`. The name
is lowercase letters and digits with single hyphens between them, and it is the name owners
install the addon by. The folder holds <!-- fact:addons.files -->`manifest.json`, `addon.json` and `README.md`<!-- /fact -->,
plus the pack's `scripts/` and any other pack files.

- `manifest.json` is the pack's manifest. Its header's `version` is the addon's version, and every
  module carries the same version. The modules are <!-- fact:addons.moduleTypes -->`data` and `script`<!-- /fact --> only, and each script
  module's `entry` exists.
- `addon.json` holds what the index needs beside the manifest:

  ```json
  {
      "description": "Shows TPS, MSPT and ping on a boss bar.",
      "minServer": "0.23.0",
      "license": "MIT"
  }
  ```

  `minServer` is the oldest JSPrismarine version the addon runs on. The file takes no other keys,
  so a version written here by mistake fails the build instead of disagreeing with the manifest.

The pack holds every file in the folder except those whose names start with a dot. A symbolic link
fails the build.

## Building

```sh
npx @jsprismarine/addon-tools build --addons addons --out dist/addons --repository owner/repo
```

The build downloads the index the repository has already published and merges the new packs into
it. Every published version stays in the index, since an installed addon is locked to its version's
URL and hash. A pack whose version is published with other contents fails the build: raise the
version in the manifest header instead. `--offline` skips the download.

The index's URLs point at the repository's <!-- fact:addons.releaseTag -->`addons`<!-- /fact --> release. `--base-url` points them
somewhere else. In GitHub Actions, `--repository` defaults to the repository the workflow runs in,
and `--github-output "$GITHUB_OUTPUT"` gives the release's tag and the new packs to later steps.
`jsp-addon --help` lists every option.

## Publishing from GitHub Actions

`.github/workflows/addons-release.yml` in the JSPrismarine repository is a reusable workflow that
builds the addons and attaches the new packs and the index to the release. A repository of addons
calls it:

```yaml
on:
    pull_request:
    push:
        branches: [main]

# One publish at a time, so two runs cannot each upload an index that lacks the other's packs.
concurrency:
    group: ${{ github.workflow }}-${{ github.ref }}
    cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
    addons:
        uses: JSPrismarine/JSPrismarine/.github/workflows/addons-release.yml@<commit sha>
        permissions:
            contents: write
        with:
            tools: latest
            publish: ${{ github.event_name == 'push' && github.ref == 'refs/heads/main' }}
```

A pull request only builds, which catches an invalid addon or a changed pack without a new version.
A push to `main` also publishes. `addons` sets the folder when it is not `addons`, and `tools` takes
an exact version of this package to pin the build.

## The index

The release carries <!-- fact:addons.indexFile -->`index.json`<!-- /fact --> beside the packs. Schema version <!-- fact:addons.indexSchemaVersion -->`1`<!-- /fact --> lists every
published version of every addon, sorted by name and then version:

```json
{
    "schemaVersion": 1,
    "addons": [
        {
            "name": "tps-bar",
            "version": "1.0.0",
            "description": "Shows TPS, MSPT and ping on a boss bar.",
            "minServer": "0.23.0",
            "url": "https://github.com/JSPrismarine/JSPrismarine/releases/download/addons/tps-bar-1.0.0.mcpack",
            "sha256": "<the pack's SHA-256>"
        }
    ]
}
```

`@jsprismarine/addon-tools/addonIndex` reads and writes it:

```ts
import { parseAddonIndex } from '@jsprismarine/addon-tools/addonIndex';

const index = parseAddonIndex(await (await fetch(url)).json());
```

`parseAddonIndex` throws an `InvalidAddonIndexError` from `@jsprismarine/errors/addon-tools` for
an index that breaks the schema, and drops keys an entry has beyond it. `mergeAddonIndex`,
`createAddonIndex` and `serializeAddonIndex` build one. `@jsprismarine/addon-tools/addon` reads
and packs one addon, and `@jsprismarine/addon-tools/build` builds a folder of them.
