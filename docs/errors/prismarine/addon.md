---
title: '@jsprismarine/prismarine addon errors'
description: The code, message and meaning of every error in the addon catalog of @jsprismarine/prismarine.
group: Documents
category: Errors
---

# @jsprismarine/prismarine addon errors

These are the errors in the `addon` catalog of `@jsprismarine/prismarine`. [The error reference](../README.md) explains how to read an entry, and [the package's page](../prismarine.md) lists its other catalogs and the classes that group its errors.

<!-- fact:errors.page.prismarine.addon -->
## `PRISMARINE_ADDON_ALREADY_INSTALLED`

`{key} is already installed; run addon update {key}, or install this one with as <another name>`

Thrown as `PrismarineAddonErrors.AddonAlreadyInstalled`, which extends `Error`.

An addon is already installed under this local name. Run `addon update <name>` to move it to
a newer version, or install the other addon under another name with `as <name>`.

## `PRISMARINE_ADDON_DOWNLOAD_FAILED`

`could not download {url}: {status}`

Thrown as `PrismarineAddonErrors.AddonDownloadFailed`, which extends `Error`.

An addon's pack could not be downloaded: the server answered with an error, did not answer
or finish in time, or redirected to a URL that is not `https:`. Check the URL, or try again
later.

## `PRISMARINE_ADDON_HASH_MISMATCH`

`{url} has SHA-256 {actual}, not the {expected} {recordedBy} records`

Thrown as `PrismarineAddonErrors.AddonHashMismatch`, which extends `AddonIntegrityError`.

A downloaded pack's SHA-256 is not the one the index or `addons.lock.json` records, so it is
not the pack that was published or installed, and the installer refuses it. When the lock is
the one that disagrees, the file at that URL changed after it was installed: run `addon
update <name>` to install what the source publishes now.

## `PRISMARINE_ADDON_NEEDS_NEWER_SERVER`

`{name} {version} needs JSPrismarine {minServer} or newer, and this server is {server}`

Thrown as `PrismarineAddonErrors.AddonNeedsNewerServer`, which extends `Error`.

Every version of the addon in the range needs a newer JSPrismarine than this server. Update
the server, or ask for an older version of the addon with `@<version>`.

## `PRISMARINE_ADDON_NOT_INSTALLED`

`no addon is installed as {key}; addon list shows what is`

Thrown as `PrismarineAddonErrors.AddonNotInstalled`, which extends `Error`.

No addon is installed under this local name. `addon list` shows what is.

## `PRISMARINE_ADDON_PATH_MISSING`

`{key} is installed from {path}, which does not exist`

Thrown as `PrismarineAddonErrors.AddonPathMissing`, which extends `Error`.

An addon installed from a local folder is linked to that folder, and the folder is gone.
Put it back, or run `addon remove <name>`.

## `PRISMARINE_ADDON_PATH_NOT_PACK`

`{key} was installed from the .mcpack {path}, which is now a folder`

Thrown as `PrismarineAddonErrors.AddonPathNotPack`, which extends `AddonIntegrityError`.

An addon was installed from an `.mcpack` on disk, whose hash the lock records, and that path
now names a folder. Run `addon remove <name>`, then install the folder.

## `PRISMARINE_ADDON_SOURCE_INSIDE_TARGET`

`cannot install {key} from {path}: it is inside addons/{key}, which the install replaces`

Thrown as `PrismarineAddonErrors.AddonSourceInsideTarget`, which extends `Error`.

A folder installs as a link from `addons/<name>/` to it, which replaces what `addons/<name>/`
holds, so the folder cannot be that one or inside it. Move it out of `addons/` and install it
from there.

## `PRISMARINE_ADDON_TOO_LARGE`

`{url} is larger than the {limit} bytes an addon pack may be`

Thrown as `PrismarineAddonErrors.AddonTooLarge`, which extends `AddonIntegrityError`.

An addon's pack is larger than the installer reads into memory, so it stopped the download.
An addon is a behavior pack of scripts and data, which stays far below the limit; a pack this
large is not one.

## `PRISMARINE_ADDON_VERSION_DIFFERS`

`{key} is version {actual} inside, but {recordedBy} lists it as {expected}`

Thrown as `PrismarineAddonErrors.AddonVersionDiffers`, which extends `AddonIntegrityError`.

The pack's manifest has another version than the index or `addons.lock.json` lists for it,
even though its SHA-256 matches. The source published the wrong pack under that version.
Ask its author to publish it again.

## `PRISMARINE_ADDON_VERSION_NOT_FOUND`

`{source} has no version of {name} in {range}`

Thrown as `PrismarineAddonErrors.AddonVersionNotFound`, which extends `Error`.

The source's index has no version of the addon that falls in the range.

## `PRISMARINE_INVALID_ADDON_KEY`

`{key} is not a local addon name: use lowercase letters, digits and single hyphens`

Thrown as `PrismarineAddonErrors.InvalidAddonKey`, which extends `TypeError`.

An installed addon's local name is its key in `addons.json` and its folder under `addons/`,
so it may hold only lowercase letters, digits and single hyphens between them. Pick another
with `addon install <addon> as <name>`.

## `PRISMARINE_INVALID_ADDON_PACK`

`{key} is not a behavior pack: {problem}`

Thrown as `PrismarineAddonErrors.InvalidAddonPack`, which extends `AddonIntegrityError`.

What was installed is not an addon: it has no `manifest.json` at its root or in a single
folder, the manifest is not a behavior pack's, or a file in the archive would land outside
the addon's folder.

## `PRISMARINE_INVALID_ADDON_SPEC`

`{spec} is not an addon to install: {problem}`

Thrown as `PrismarineAddonErrors.InvalidAddonSpec`, which extends `TypeError`.

`addon install` takes a bare addon name such as `tps-bar`, `<owner>/<repo>/<name>`, either
with an optional `@<range>`, an `https:` URL of an `.mcpack`, or a path that starts with
`./`, `../` or `/` or ends in `.mcpack`. A range is `^1.2.3`, `~1.2.3`, `1.2.3` or `*`. Fix
what the message names.

## `PRISMARINE_INVALID_ADDONS_FILE`

`{file} is invalid: {problem}`

Thrown as `PrismarineAddonErrors.InvalidAddonsFile`, which extends `TypeError`.

`addons.json` or `addons.lock.json` beside `config.json` is not what the installer writes.
Fix what the message names in the file it names. Only when `addons.lock.json` is the broken
one may you delete it instead: `addon sync` then resolves every addon again, which can pick
newer versions within each range than the ones locked.

## `PRISMARINE_NO_ADDON_INDEX`

`{source} publishes no addon index at {url}`

Thrown as `PrismarineAddonErrors.NoAddonIndex`, which extends `Error`.

The source's release has no index to install from: the repository has no `addons` release,
or the release has no `index.json` yet. Check the repository's name.
<!-- /fact -->
