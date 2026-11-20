---
'@jsprismarine/packs': patch
---

The optional Spyglass peers move to `@spyglassmc/core` 0.4.58, `@spyglassmc/json` 0.3.62 and `@spyglassmc/mcdoc` 0.3.62, the versions `@spyglassmc/java-edition` 0.3.71 depends on. With the older pins two copies of `@spyglassmc/core` were installed, and the mcdoc validator passed a registry from one to an API typed with the other.
