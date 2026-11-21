---
'@jsprismarine/script-host': patch
'@jsprismarine/server': patch
---

A Node single executable from `pnpm run package` embeds the script host's library and writes it to its cache on first run, so behavior pack scripts run in it. `@jsprismarine/script-host/embed` exports `libraryForPlatform` and `provideEmbeddedLibrary` for a packager, as `@jsprismarine/native-network` does.
