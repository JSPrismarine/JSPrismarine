---
title: Installing addons
description: Install, update and remove addons from the server console, and keep them when you move the server.
group: Documents
category: Guides
---

# Installing addons

An addon is optional content that you install from the server console while the server runs: a
behavior pack, a resource pack, or an archive of several packs and worlds. The console's
<!-- fact:addons.command -->`addon`<!-- /fact --> command downloads it, checks it, and loads its
scripts without a restart. Two files beside `config.json` record what you asked
for and exactly what was installed, so the same addons come back on another machine.
[Addons](../addons/README.md) lists the ones JSPrismarine publishes.

## Install an addon

Type the command on the server's console, the terminal you started the server from or the remote
console:

```text
addon install tps-bar
```

The server reads the index of the addon's source, picks the newest version that runs on this
server, downloads the pack and checks its SHA-256 against the index. It unpacks the pack into
<!-- fact:addons.directory -->`addons/`<!-- /fact --> in the server's folder, records it in both
files and reloads the scripts. The console prints the version it installed and where the pack
came from.

`addon install` takes the addon in any of these forms:

| Form                           | Installs                                                             |
| ------------------------------ | -------------------------------------------------------------------- |
| `tps-bar`                      | An addon from JSPrismarine's own repository.                         |
| `someone/their-addons/warps`   | The addon `warps` from the GitHub repository `someone/their-addons`. |
| `tps-bar@~1.2.0`               | Either of the above, within a version range.                         |
| `https://example.com/x.mcpack` | A pack at an `https:` URL, which no index lists.                     |
| `./my-addon`                   | A folder or an archive on the server's machine.                      |

A bare name installs from <!-- fact:addons.defaultSource -->`JSPrismarine/JSPrismarine`<!-- /fact -->.
A name with an owner and a repository installs from that repository's
<!-- fact:addons.releaseTag -->`addons`<!-- /fact --> release, which any GitHub repository can publish;
[Publishing addons](publishing-addons.md) explains how. The [marketplace](../addons/README.md) on
jsprismarine.dev lists JSPrismarine's addons and those of other repositories, with the command that
installs each. JSPrismarine checks that a listed addon is what it says it is, but nobody reviews
other people's scripts, so install from repositories you trust.

### Version ranges

A range after `@` limits which versions an install, and every later update, may pick. The ranges
read the way npm reads them:

| Range    | Takes                                              |
| -------- | -------------------------------------------------- |
| `^1.2.0` | Any `1.x.x` from `1.2.0` on, but not `2.0.0`.      |
| `~1.2.0` | Patches of `1.2`, from `1.2.0` on.                 |
| `1.2.0`  | That version only.                                 |
| `*`      | Any version.                                       |

Without a range, the install takes the newest version and records `^` and that version, so later
updates take its fixes and features but no breaking release. When the newest version in range
needs a newer server than yours, the install takes the newest one that runs on yours, and refuses
when none does.

### URLs and paths

A URL or a path installs a pack without a source. No index vouches for a URL, so the console says
that no hash checked the download, and the lock records the hash of what was downloaded. From then
on, the server refuses a download from that URL that no longer matches, until `addon update`
takes the new pack and locks its hash.

A path starts with `./`, `../`, `/` or `~/`, or ends in
<!-- fact:addons.archiveExtensions -->`.mcpack`, `.mcaddon`, `.mcworld`, `.mctemplate` or `.mcproject`<!-- /fact -->. A relative path is relative to
the folder you started the server from, and the server stores it relative to the server's folder
when it is inside that folder. A folder installs as a link to it rather than a copy, so an edit to
its scripts shows after `/reload`. [Writing an addon](writing-addons.md#test-it-on-a-server) uses
that to test a pack while you write it.

### What an archive installs

The server installs what a Bedrock client would import from the same file:

- An `.mcpack` is one pack. A behavior pack, whose modules are data and script modules, runs on
  the server. A resource pack, whose modules are resources modules, goes to players as they join.
  The pack unpacks into `addons/<name>/`.
- An `.mcaddon` holds several packs and worlds, each a nested `.mcpack`, `.mcworld` or
  `.mctemplate`, or a folder with its own `manifest.json` or `level.dat`. Every pack installs,
  into a folder of its own under `addons/<name>/` named after it: `Furniture BP.mcpack` unpacks
  into `addons/furniture/furniture-bp/`.
- An `.mcworld` imports as a level, and so does an `.mctemplate`, as a new level made from the
  template. See [Worlds](#worlds).

The console lists the packs an archive installed. It warns about a skin pack, which players
import themselves, and about a nested archive it cannot read, and installs the rest. It also
warns when a pack's manifest depends on a pack that no installed addon holds.

An `.mcproject` is a Minecraft Editor project, which the server does not open. The install fails
and says so; export the project from the Editor as an `.mcworld` and install that.

### Worlds

A world in an archive imports once, the first time the archive installs. The server writes it
into a new folder under `worlds/` and records it in `levels.json` as a detached level, named after
the world's `levelname.txt`, with the seed and the flat or normal generator its `level.dat` names.
The console prints its name and UUID. Run `world attach <name>` to put it in play;
[Managing worlds while the server runs](running.md#managing-worlds-while-the-server-runs) covers
the rest.

`addons.lock.json` records the level each world became, so reinstalling or updating the archive,
or restoring it on another machine, never imports a second copy. `addon remove` keeps the level:
the world is yours from then on, and `world detach` takes it out of play.

A world's own behavior and resource packs, the ones its `world_behavior_packs.json` and
`world_resource_packs.json` turn on, install with the archive's packs. They apply to the whole
server, since the server builds one set of content at startup for every level.

### Drop a file into `addons/`

You can also install an archive without the console: copy it into the
<!-- fact:addons.directory -->`addons/`<!-- /fact --> folder and start the server, run `/reload` or
run `addon sync`. The server creates the folder at startup when it is missing. A file that
`addons.json` does not name yet joins it as a path, as `addon install ./addons/<file>` would add
it, under a local name made from the file's name: `Furniture_Pack v2.mcaddon` installs as
`furniture-pack-v2`. When another addon already has that name, the console says so and the file
waits until you rename it.

Replace the file with a new one and the next sync installs it. Delete the file and the next sync
removes the addon. `addon remove` deletes the file as well, since the next sync would otherwise
install it again.

### Choose the local name with `as`

Each installed addon has a local name, which is also its folder under `addons/`. It is the addon's
name unless you give another with `as`:

```text
addon install someone/their-addons/tps-bar as their-tps-bar
```

Use `as` to install two addons of the same name from different repositories side by side, or to
name a pack whose URL or file name gives no addon name. A pack file such as `warps-1.0.0.mcpack`
installs as `warps` without it. The other subcommands take the local name.

## The two files

The server's folder holds two files beside `config.json`.
<!-- fact:addons.requestFile -->`addons.json`<!-- /fact --> says what you asked for. The `addon`
command writes it, and you may edit it by hand. Each key is a local name, with the source and range
it came from, or its URL or path:

<!-- fact:addons.requestExample -->
```json
{
    "addons": {
        "furniture": {
            "path": "addons/furniture.mcaddon"
        },
        "my-addon": {
            "path": "../my-addon"
        },
        "their-tps-bar": {
            "source": "someone/their-addons",
            "name": "tps-bar",
            "version": "^2.1.0"
        },
        "tps-bar": {
            "source": "JSPrismarine/JSPrismarine",
            "version": "^1.0.0"
        }
    }
}
```
<!-- /fact -->

`name` is there only when it differs from the key, as it does for an addon installed with `as`.

<!-- fact:addons.lockFile -->`addons.lock.json`<!-- /fact --> says what each key resolved to: the
version, where the pack came from and its SHA-256. Only the command writes it. Its format is
lockfile version <!-- fact:addons.lockfileVersion -->`1`<!-- /fact -->:

<!-- fact:addons.lockExample -->
```json
{
    "lockfileVersion": 1,
    "addons": {
        "furniture": {
            "path": "addons/furniture.mcaddon",
            "name": "furniture",
            "version": "1.2.0",
            "sha256": "<the .mcaddon's SHA-256>",
            "packs": [
                {
                    "folder": "furniture-bp",
                    "type": "behavior",
                    "uuid": "<its header UUID>",
                    "version": "1.2.0"
                },
                {
                    "folder": "furniture-rp",
                    "type": "resource",
                    "uuid": "<its header UUID>",
                    "version": "1.2.0"
                }
            ],
            "worlds": [
                {
                    "member": "showroom.mcworld",
                    "level": "<the level's UUID>"
                }
            ]
        },
        "my-addon": {
            "path": "../my-addon",
            "name": "my-addon",
            "version": "0.1.0"
        },
        "their-tps-bar": {
            "source": "someone/their-addons",
            "name": "tps-bar",
            "version": "2.1.3",
            "url": "https://github.com/someone/their-addons/releases/download/addons/tps-bar-2.1.3.mcpack",
            "sha256": "<the pack's SHA-256>"
        },
        "tps-bar": {
            "source": "JSPrismarine/JSPrismarine",
            "name": "tps-bar",
            "version": "1.0.0",
            "url": "https://github.com/JSPrismarine/JSPrismarine/releases/download/addons/tps-bar-1.0.0.mcpack",
            "sha256": "<the pack's SHA-256>"
        }
    }
}
```
<!-- /fact -->

The SHA-256 is the hash of the archive as downloaded or read, not of the unpacked folder. A linked
folder has no hash, since its files change as you edit them. A path to an archive has one, like a
URL. An archive's entry also lists its `packs`, each with its folder inside the addon's, its type,
its header UUID and its version, and the `worlds` it imported, each with the level it became. An
addon from a source is one behavior pack, so its entry lists neither.

An `.mcaddon` that a server before this one installed got its behavior pack alone. One from a
URL or a path installs again on the next sync, from the bytes its lock's hash pins, and takes the
rest of its packs. When those bytes are gone or changed, the sync refuses it as it refuses any
other download that no longer matches.

Keep both files with the server, in a backup or in version control, as you keep `config.json`.
The `addons/` folder can be rebuilt from them, except the pack files you placed in it yourself.

## List, update and remove

`addon list` shows each local name, its version and where it came from. It also shows an entry
that only one of the two files names, with what `addon sync` would do about it, and marks an addon
whose author has deprecated the installed version.

An author deprecates an addon in a new version, with the reason and, when there is one, the addon
that replaces it. `addon install` and `addon update` print both as a warning when they install or
keep that version:

<!-- fact:addons.deprecationWarning -->
```text
warps 2.0.0 is deprecated: "Use warps-plus instead." Install its replacement with addon install someone/their-addons/warps-plus.
```
<!-- /fact -->

Neither refuses a deprecated addon, so it keeps working until you move. `addons.lock.json` records
the reason beside the addon's lock.

`addon update` looks for a newer version of every addon within its range, and
`addon update tps-bar` for one. It installs what changed, rewrites the lock and reloads the
scripts. A restart, a sync and a new machine all install the version the lock names, as long as
`addons.json` still allows it. To move to a version outside the range, such as a new major version,
edit the range in `addons.json` and run `addon sync`: an entry whose lock its source, name or
range no longer allows resolves again and locks the newest version it allows. Removing the addon
and installing it again does the same.

`addon remove tps-bar` takes the addon out of both files, deletes its folder and unloads its
scripts.

`addon sync` brings the `addons/` folder in line with the two files, the same way the server does
at startup. Run it after you edit `addons.json` by hand.

## At startup

Before the server loads its packs, it does what `addon sync` does:

- It adds each archive in `addons/` that `addons.json` does not name, and takes out an entry
  whose file in `addons/` is gone.
- It removes a locked addon that `addons.json` no longer names.
- It installs a locked addon whose folder is missing, or holds another version, from the URL in
  the lock, and refuses a download whose SHA-256 is no longer the one locked.
- It resolves an entry of `addons.json` that has no lock, or whose lock its range no longer
  allows, installs it and locks it. A file in `addons/` whose hash is no longer the one locked
  installs again.

`/reload` runs the same sync before it reloads the scripts.

An addon that cannot install doesn't stop the others or the server. The console logs why, and the
server starts without it. The check compares the version in each folder's `manifest.json` with
the lock; it does not hash the unpacked files. An edit to an installed addon's files stays until
its version changes, so delete its folder to get the published files back.

Installed addons load after the packs in `content-world-packs`, in the order of their local names.

## Move a server

To move a server to another machine, or to restore one from a backup, copy `config.json`,
`addons.json`, `addons.lock.json`, `levels.json`, the worlds and any archive you placed in
`addons/`. `levels.json` records the levels an archive imported, which `world attach` looks up
there. The rest of the `addons/` folder can stay behind: on its
first start, the server downloads every locked addon again, checks each against the hash in the
lock, and installs the same versions. A server whose addon is no longer downloadable from its
locked URL logs that addon as failed and starts without it.

An addon installed from a path needs that path on the new machine too, since the lock records the
path and nothing to download. A path inside the server's folder is stored relative to it, so it
moves with the folder. When the path is missing, the server logs the addon as failed and starts
without it.

## Resource packs

Players download the installed resource packs when they join, and the game asks each player
whether to take them. Set `texturepack-required` in `config.json` to `true`, as on a Bedrock
Dedicated Server, to make the packs a condition of joining: the game then downloads them without
asking, and a player who declines is disconnected.

The packs stack in the order of the local names, and inside an addon in the order of their
folders, except that a pack goes above the packs it depends on. A player online when a resource
pack installs gets it the next time they join.

Set `disable-client-vibrant-visuals` to `true` to tell joining players to use the next best
graphics setting instead of Vibrant Visuals, as the Bedrock Dedicated Server setting of the same
name does.

### Subpacks

A resource pack can list `subpacks` in its manifest: folders under `subpacks/` that the game
applies on top of the pack, such as a lower resolution for devices with less memory. To choose
one, list the pack in `world_resource_packs.json` in the folder of the level players join first,
as a Bedrock Dedicated Server reads it:

```json
[{ "pack_id": "aaaaaaaa-0000-4000-8000-000000000001", "version": [1, 0, 0], "subpack": "high" }]
```

`pack_id` is the pack's header UUID, `version` its version, and `subpack` the `folder_name` of the
subpack. The server reads the file each time a player joins. It picks no subpack for an entry
whose version is not the installed pack's, or whose `subpack` the manifest does not list, and the
game then picks one by itself. Listing a pack here does not install it, and an installed pack the
file does not list is still sent.

### Encrypted packs

A Marketplace-style encrypted resource pack holds a binary `contents.json` beside its
`manifest.json`, and the game needs the pack's 32-byte content key to read it. The server sends
the key from a file beside the pack:

- For an `.mcpack`, or a folder you install by path, put the key in a file with the same name and
  `.key` added, such as `lights.mcpack.key` beside `lights.mcpack`.
- In an `.mcaddon`, put the key beside the pack it opens, at the top of the archive, such as
  `resources.mcpack.key` beside `resources.mcpack`, or `RP.key` beside the folder `RP/`.

The installer keeps the key beside the pack's folder under `addons/`, outside what players
download, and removes it with the addon. An encrypted pack with no key, or with a key that is not
32 bytes long, is still sent, and the console names the file to fix; players cannot read the pack
until it has its key. A Bedrock Dedicated Server cannot serve such a pack, because it reads keys
only from Marketplace purchases.

## When a restart is needed

An install, an update or a removal reloads the behavior pack scripts with the new list of packs,
as `/reload` does, so every pack's scripts start over. A pack's scripts and texts load this way. Anything else it holds, such as blocks, items, entities,
recipes or loot tables, joins the content build, which runs at startup. For an install while the
server runs, the console names those folders and says they load when the server restarts. An
addon the server installs as it starts, such as a file dropped into `addons/` while it was
stopped, loads them in that start's build. A removal leaves them loaded until the restart.
When the scripts fail to load again, the command reports why, and the next `addon sync` reloads
them.

## Only the console runs it

`addon` is a level <!-- fact:addons.commandLevel -->5<!-- /fact --> command, above an operator's
level 4, behind the permission <!-- fact:addons.commandPermission -->`jsprismarine.command.addon`<!-- /fact -->.
It also requires that the console typed it, so a player, an operator, `/execute`, a function and
a script all fail to run it, whatever their permissions.

An addon runs code on your server. Its scripts are a script pack, so that code runs in the script host's
sandbox with the Script API's reach and nothing more, but it can still change your worlds and talk
to your players. Keeping the command on the console leaves the choice of what runs with whoever
runs the server machine. The [command reference](commands.md#addons) lists the subcommands.
