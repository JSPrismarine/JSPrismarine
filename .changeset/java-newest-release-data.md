---
'@jsprismarine/protocol': patch
---

Add `@jsprismarine/protocol/java/versions/newest`, which exports the newest Java release's block states, registries, configuration and English under the names each release's own modules use, so code that serves Java clients names no release. `dump:java-protocol` now writes every module of a release, captures its configuration phase and regenerates `javaReleases.ts` and `newest.ts` from the releases it finds. Each Java packet definition names the vanilla codec it copies with `@javaSource`, so a new Java release's changed layouts show up in the `java.transcriptions` parity family.
