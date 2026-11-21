---
'@jsprismarine/server': patch
'@jsprismarine/native-worldgen': patch
---

The Bun AOT and Node single executables embed `@jsprismarine/native-worldgen`'s library for their platform and write it to the cache on first start, as they do the networking and script host libraries, so a packaged server generates terrain with native noise. `@jsprismarine/native-worldgen/embed` gives a packager `libraryForPlatform` and `provideEmbeddedLibrary`.
