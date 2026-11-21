---
title: Addons
description: The optional behavior packs JSPrismarine publishes, and how to install, write, publish and list one.
group: Documents
category: Addons
---

# Addons

An addon is an optional behavior pack that a server owner installs from the server console while
the server runs. None of them ships with the server, so a server has only the addons its owner
chose. Each addon is an ordinary script pack, so it runs in the script host's sandbox with the
Script API's reach and nothing more.

Install one by its name on the console:

<!-- fact:addons.installExample -->
```text
addon install <name>
```
<!-- /fact -->

The server downloads the newest version that runs on it, checks the pack's SHA-256 against the
index it came from, and loads it without a restart.
[Installing addons](../guide/installing-addons.md) covers the command, the two files that record
what is installed, and moving a server to another machine.

## JSPrismarine's addons

These are the addons in this repository's [`addons/`](../../addons/README.md) folder, read from
each addon's <!-- fact:addons.files -->`manifest.json`, `addon.json` and `README.md`<!-- /fact --> when the site is built. Each version
listed here goes onto the <!-- fact:addons.releaseTag -->`addons`<!-- /fact --> release once its change reaches `master`.

<!-- fact:addons.catalog -->
### [Standard Placeholders](../../addons/standard-placeholders/README.md)

Provides the standard player, server and world placeholders, and /placeholders to list and try them.

| Version | Runs on | License |
| ------- | ------- | ------- |
| `1.0.1` | JSPrismarine `0.23.0` or newer | (MIT OR MPL-2.0) |

```text
addon install standard-placeholders
```

### [Tab List](../../addons/tab-list/README.md)

Renames the entries in the player list from templates: one per player, per group or for everyone.

| Version | Runs on | License |
| ------- | ------- | ------- |
| `1.0.1` | JSPrismarine `0.23.0` or newer | (MIT OR MPL-2.0) |

```text
addon install tab-list
```

### [TPS Bar](../../addons/tps-bar/README.md)

Shows TPS, MSPT and ping on a boss bar.

| Version | Runs on | License |
| ------- | ------- | ------- |
| `1.0.3` | JSPrismarine `0.23.0` or newer | (MIT OR MPL-2.0) |

```text
addon install tps-bar
```
<!-- /fact -->

## Addons from other repositories

Any GitHub repository can publish addons the same way JSPrismarine does, several to one
repository. Install one by its repository and name, such as
`addon install someone/their-addons/warps`. The [marketplace](https://jsprismarine.dev/addons/)
on jsprismarine.dev lists these addons beside JSPrismarine's own, from the repositories
<!-- fact:addons.listingsFile -->`addons/listings.json`<!-- /fact --> names. JSPrismarine reviews
each listing, not the addon's scripts, so the console prints which repository each install came
from and whether an index's hash checked the download.

## Guides

- [Installing addons](../guide/installing-addons.md): the <!-- fact:addons.command -->`addon`<!-- /fact --> command,
  <!-- fact:addons.requestFile -->`addons.json`<!-- /fact --> and <!-- fact:addons.lockFile -->`addons.lock.json`<!-- /fact -->, updating, and what the server does at
  startup.
- [Writing an addon](../guide/writing-addons.md): the folder layout, `addon.json`, JSPrismarine's
  script module, and testing a pack on a local server.
- [Listing an addon](../guide/listing-addons.md): a page in the marketplace for an addon you
  publish, the listing keys in `addon.json`, and deprecating an addon.
- [Publishing addons](../guide/publishing-addons.md): a repository of your own,
  <!-- fact:addons.cli -->`jsp-addon`<!-- /fact --> `build`, the release workflow and the index servers install from.
