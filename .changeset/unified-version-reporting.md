---
'@jsprismarine/prismarine': patch
'@jsprismarine/server': patch
---

Every place the server states its version now reads one source: `serverVersion()` and `softwareLabel()` in `@jsprismarine/prismarine/version` for the software, and the new `about()` in `@jsprismarine/prismarine/about` for the advertised Minecraft release and protocol. The startup log, `/version`, `--version`, the console title bar, the server-list MOTD and the query reply all read them, so nightly builds now print their stamped version from `--version` and in the console title bar instead of the package version.
