---
'@jsprismarine/prismarine': patch
'@jsprismarine/errors': patch
---

`addon install` and the files dropped into `addons/` install every pack an archive holds. An `.mcaddon` with several behavior packs and resource packs unpacks each into a folder of its own under `addons/<name>/`, and an `.mcpack` that is a resource pack installs too. `addons.lock.json` lists the packs an archive from a URL or a path installed, and `addon list` shows them. An `.mcworld` or `.mctemplate`, or one inside an `.mcaddon`, imports once as a detached level in `levels.json`, with the packs its `world_behavior_packs.json` and `world_resource_packs.json` turn on. A skin pack is skipped with a warning, an `.mcproject` is refused with a reason, and a pack that needs another no installed addon holds is named. An `.mcaddon` installed before this, from a URL or a path, installs again on the next sync from the bytes its lock's hash pins, to take its other packs. The notices that content loads, or stays loaded, until the server restarts are info now rather than warnings, so an `.mcaddon` install logs like any other.
