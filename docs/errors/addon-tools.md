---
title: '@jsprismarine/addon-tools errors'
description: The code, message and meaning of every error @jsprismarine/addon-tools throws.
group: Documents
category: Errors
---

# @jsprismarine/addon-tools errors

These are the errors `@jsprismarine/addon-tools` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.addon-tools -->
## Groups

Catch one of these classes to handle every error that extends it.

| Class                    | What its errors mean                                             |
| ------------------------ | ---------------------------------------------------------------- |
| `InvalidAddonError`      | Error thrown when an addon's folder does not hold a valid addon. |
| `InvalidAddonIndexError` | Error thrown when an addon index does not follow its schema.     |

## `ADDON_TOOLS_INVALID_ADDON_ICON`

`addon {addon}'s pack_icon.png is invalid: {problem}`

Thrown as `AddonToolsErrors.InvalidAddonIcon`, which extends `InvalidAddonError`.

An addon's `pack_icon.png` is the icon Bedrock and the marketplace show, so it has to be a
square PNG image. Save it as a PNG of equal width and height, such as 256 by 256 pixels.

## `ADDON_TOOLS_INVALID_ADDON_INDEX`

`the addon index is invalid: {problem}`

Thrown as `AddonToolsErrors.InvalidAddonIndex`, which extends `InvalidAddonIndexError`.

An addon index is not the object its schema describes. Fix what the message names.

## `ADDON_TOOLS_INVALID_ADDON_JSON`

`addon {addon}'s addon.json is invalid: {problem}`

Thrown as `AddonToolsErrors.InvalidAddonJson`, which extends `InvalidAddonError`.

An addon's `addon.json` is not the object the build expects: a `description`, a `minServer`
version such as `0.23.0`, and a `license`, each a non-empty string, plus the optional listing
keys `title`, `tags`, `authors`, `screenshots`, `deprecated` and `replacedBy`, and no other
keys. Tags come from a fixed list, and each screenshot is a file under `media/` with alt text.
The addon's version lives in its `manifest.json` header, not here.

## `ADDON_TOOLS_INVALID_ADDON_MANIFEST`

`addon {addon}'s manifest.json is invalid: {problem}`

Thrown as `AddonToolsErrors.InvalidAddonManifest`, which extends `InvalidAddonError`.

An addon's `manifest.json` is not a valid behavior pack manifest. Fix what the message names.

## `ADDON_TOOLS_INVALID_ADDON_NAME`

`{name} is not an addon name: use lowercase letters, digits and single hyphens`

Thrown as `AddonToolsErrors.InvalidAddonName`, which extends `InvalidAddonError`.

An addon's folder name is also its name in the index and in `addon install`, so it may hold
only lowercase letters, digits and single hyphens between them, such as `tps-bar`. Rename the
folder.

## `ADDON_TOOLS_INVALID_ARGUMENTS`

`{problem}; run jsp-addon --help for usage`

Thrown as `AddonToolsErrors.InvalidArguments`, which extends `TypeError`.

The `jsp-addon` command line was given arguments it does not take. Run `jsp-addon --help`.

## `ADDON_TOOLS_INVALID_BASE_URL`

`the base URL {url} is not an https URL`

Thrown as `AddonToolsErrors.InvalidBaseUrl`, which extends `TypeError`.

The URL a release's files download from must be an `https:` URL.

## `ADDON_TOOLS_MISSING_ADDON_FILE`

`addon {addon} has no {file}`

Thrown as `AddonToolsErrors.MissingAddonFile`, which extends `InvalidAddonError`.

An addon's folder lacks a file every addon needs. Add the file the message names.

## `ADDON_TOOLS_MISSING_SCRIPT_ENTRY`

`addon {addon}'s script entry {entry} does not exist`

Thrown as `AddonToolsErrors.MissingScriptEntry`, which extends `InvalidAddonError`.

An addon's script module names an `entry` file the folder does not have.

## `ADDON_TOOLS_MODULE_VERSION_DIFFERS`

`addon {addon}'s {type} module is version {moduleVersion}, but its header is {version}`

Thrown as `AddonToolsErrors.ModuleVersionDiffers`, which extends `InvalidAddonError`.

The header's version is the addon's version, and every module of the manifest has to carry
the same one, so a release never mixes versions. Set the module's version to the header's.

## `ADDON_TOOLS_NOT_ABEHAVIOR_PACK`

`addon {addon} has a {type} module; an addon is a behavior pack with data and script modules only`

Thrown as `AddonToolsErrors.NotABehaviorPack`, which extends `InvalidAddonError`.

An addon is a behavior pack, so its manifest may declare only `data` and `script` modules.
Move resource pack content into a pack of its own.

## `ADDON_TOOLS_PUBLISHED_INDEX_UNAVAILABLE`

`could not download the published index {url}: {status}`

Thrown as `AddonToolsErrors.PublishedIndexUnavailable`, which extends `Error`.

The published addon index could not be downloaded: the release answered with an error other
than 404, or did not answer. Check the URL and try again; a 404 means there is no release
yet and is not an error.

## `ADDON_TOOLS_PUBLISHED_LISTING_CHANGED`

`{name} {version} is already published with other listing files; raise the version in its manifest header`

Thrown as `AddonToolsErrors.PublishedListingChanged`, which extends `InvalidAddonError`.

An addon's version is already in the published index with other listing files: its README,
icon or screenshots changed. A version's page is as fixed as its pack, so raise the version in
the addon's `manifest.json` header to publish the new files.

## `ADDON_TOOLS_PUBLISHED_VERSION_CHANGED`

`{name} {version} is already published with other contents; raise the version in its manifest header`

Thrown as `AddonToolsErrors.PublishedVersionChanged`, which extends `InvalidAddonError`.

An addon's version is already in the published index with other contents. An installed
addon is locked to its version's hash, so a published version never changes. Raise the
version in the addon's `manifest.json` header.

## `ADDON_TOOLS_UNSUPPORTED_ADDON_ENTRY`

`addon {addon} has {path}, which is neither a file nor a folder`

Thrown as `AddonToolsErrors.UnsupportedAddonEntry`, which extends `InvalidAddonError`.

An addon's folder holds a symbolic link or another entry that is neither a file nor a folder.
A pack holds files only, so replace the link with the file it points at.

## `ADDON_TOOLS_UNSUPPORTED_ADDON_INDEX_VERSION`

`the addon index has schema version {schemaVersion}, and only version {supported} is readable`

Thrown as `AddonToolsErrors.UnsupportedAddonIndexVersion`, which extends `InvalidAddonIndexError`.

An addon index declares a `schemaVersion` this version of the tools does not read. Update
the tools, or the server that reads the index.
<!-- /fact -->
