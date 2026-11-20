---
'@jsprismarine/prismarine': patch
'@jsprismarine/errors': patch
---

Add the console's `addon` command, which installs, updates, lists and removes addons: `addon install tps-bar`, `addon install owner/repo/name@^1.0.0`, an `.mcpack` URL, or a folder or `.mcpack` on disk, with `as <name>` to install a second addon of the same name. `addons.json` beside `config.json` records what was asked for and `addons.lock.json` the version, URL and SHA-256 each addon installed. At startup and on `addon sync` the server installs locked addons missing from `addons/`, refusing a download whose hash changed, and removes the ones `addons.json` no longer names. Installed addons join the world's behavior packs after `content-world-packs`, and an install or removal reloads the scripts with the new list, so scripts load without a restart. Only the console runs the command: players never see it, and an operator is told it needs a higher level. `@jsprismarine/errors/prismarine/addon` holds the installer's errors.
