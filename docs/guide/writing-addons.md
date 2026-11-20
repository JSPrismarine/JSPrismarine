---
title: Writing an addon
description: Lay out an addon, describe it in addon.json, use JSPrismarine-only features safely, and test it on a local server.
group: Documents
category: Guides
---

# Writing an addon

An addon is a behavior pack with scripts, in a folder named for the addon, plus a small
`addon.json` that tells servers what it is. If you have written a script pack before, you have
written most of an addon. This page covers what an addon adds to a pack, how to reach the features
only JSPrismarine has, and how to try the addon on a server while you write it.
[Publishing addons](publishing-addons.md) picks up from there.

## The folder

The folder's name is the addon's name, the one owners type in `addon install`. It is lowercase
letters and digits, with single hyphens between words, such as `tps-bar`. The folder holds
<!-- fact:addons.files -->`manifest.json`, `addon.json` and `README.md`<!-- /fact -->, plus the
scripts and any other pack files:

```text
tps-bar/
├── manifest.json
├── addon.json
├── README.md
└── scripts/
    └── main.js
```

Every file in the folder goes into the pack, except those whose names start with a dot. A symbolic
link fails the build, so keep real files there.

## The manifest

`manifest.json` is an ordinary behavior pack manifest, and the header's `version` is the addon's
version. Every module carries the same version, and the modules are
<!-- fact:addons.moduleTypes -->`data` and `script`<!-- /fact --> only, since an addon is a behavior
pack. A script module's `entry` must exist. This is the TPS bar's, with placeholders for its UUIDs:

<!-- fact:addons.manifestExample -->
```json
{
    "format_version": 2,
    "header": {
        "name": "TPS Bar",
        "description": "Shows the server's TPS, MSPT and your ping on a boss bar. Run /tpsbar to turn it on or off.",
        "uuid": "<a new UUID>",
        "version": [1, 0, 0],
        "min_engine_version": [1, 21, 100]
    },
    "modules": [
        {
            "type": "script",
            "language": "javascript",
            "uuid": "<another new UUID>",
            "version": [1, 0, 0],
            "entry": "scripts/main.js"
        }
    ],
    "dependencies": [{ "module_name": "@minecraft/server", "version": "2.1.0" }]
}
```
<!-- /fact -->

Generate a fresh UUID for the header and for each module, and keep them when you release a new
version. [Extending JSPrismarine](extending.md#modules-and-versions) lists the Script API modules
and versions the server offers.

## `addon.json`

`addon.json` holds what an index and the installer need that the manifest doesn't say:

```json
{
    "description": "Shows TPS, MSPT and ping on a boss bar.",
    "minServer": "0.23.0",
    "license": "MIT"
}
```

- `description` is one line, which the index carries and this site shows for JSPrismarine's own
  addons.
- `minServer` is the oldest JSPrismarine version the addon runs on, as `major.minor.patch`. A
  server older than that refuses to install it, and an install picks the newest version whose
  `minServer` the server meets.
- `license` is an SPDX expression, such as `MIT` or `Apache-2.0`.

The file takes no other keys, so a version written here by mistake fails the build rather than
disagreeing with the manifest.

## The README

`README.md` goes into the pack beside the scripts. Say what the addon does, the commands it adds,
who may run them, and anything an owner should set up. For JSPrismarine's own addons, the README
is also the addon's page on this site, and its first heading is the page's title.

## Use JSPrismarine-only features

`@jsprismarine/server` gives a script what only JSPrismarine has, such as the server's ticks per
second, a player's ping and boss bars. An addon that uses it can still run on Bedrock Dedicated
Server (BDS) if it detects the module and falls back:

```js
import { world } from '@minecraft/server';

/** JSPrismarine's module, or undefined on a server without it. */
const loadJsprismarine = async () => {
    try {
        return await import('@jsprismarine/server');
    } catch {
        return undefined;
    }
};

world.afterEvents.worldLoad.subscribe(async () => {
    const jsp = await loadJsprismarine();
    if (jsp === undefined || !('bossBars' in jsp)) {
        // BDS, or a JSPrismarine too old for boss bars: carry on without them.
        return;
    }
    // ...
});
```

Leave the module out of `manifest.json`: BDS refuses a pack that declares a module it doesn't
know. [The JSPrismarine script module](jsprismarine-module.md) explains each part of the pattern
and lists every member with its types.

Two checks keep an addon working on servers of different ages. `minServer` is the floor: a server
older than it never installs the addon. Checking for a member with `in`, as above, covers the
servers newer than `minServer` that still lack a member a later release added, and lets the addon
turn that feature off instead of failing.

## Test it on a server

Run a server you can restart freely, with a flat world so startup is quick
([Worlds](running.md#worlds) shows the setting). Then install your addon's folder from the server
console:

```text
addon install ./tps-bar
```

A folder installs as a link to it rather than a copy, so the server runs the files you are
editing. After you change a script, run `/reload` on the console and the scripts start over with
your change. A change to anything besides the scripts and texts, such as an entity or an item,
loads when the server restarts. `addon list` shows the folder as linked, and
`addon remove tps-bar` takes it out again without touching your folder.

The install checks that the folder is a behavior pack with only data and script modules, and that
its `minServer` is no newer than the server. The build checks more, as the last section shows.
[Installing addons](installing-addons.md#urls-and-paths) covers paths in full.

## Debug its scripts

JSPrismarine speaks the protocol of the Minecraft Bedrock Debugger for VS Code, so you can stop at
breakpoints in an addon's scripts and inspect its variables:

1. Turn on `allow-inbound-script-debugging` in `config.json` and start the server.
2. Run `script debugger listen <!-- fact:scripting.debuggerPort -->19144<!-- /fact -->` on the console.
3. In VS Code, open the addon's folder and start an `attach` configuration of type
   `minecraft-js` with `"mode": "connect"`, the same port, `"localRoot"` set to the folder of the
   scripts, and `"targetModuleUuid"` set to the UUID of the addon's script module.
4. Run `script debugger close` on the console when you are done.

`script-debugger-auto-attach` attaches before the scripts start, so a breakpoint on a script's
first lines stops too. [Every setting](running.md#every-setting) describes the
`script-debugger-*` settings, and [Debugging](extending.md#debugging) says how far the debugger
support has been checked.

## Check the build

Before you publish, build the addon the way a release will. From the folder that holds your
`addons/` folder:

```bash
npx @jsprismarine/addon-tools build --offline --repository owner/repo
```

It checks each addon against every rule on this page, including the module versions and the
script entry, and fails with the reason when one breaks a rule. It writes `<name>-<version>.mcpack`
and an index into `dist/addons/`. `--offline` skips downloading the index a repository has already
published, and `--repository` names the repository whose release the index's URLs point at. [Publishing addons](publishing-addons.md)
explains the build in full and how to release from GitHub Actions.
