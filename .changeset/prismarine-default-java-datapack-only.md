---
'@jsprismarine/prismarine': patch
---

With `content-java-version` empty, the pack stack loads only the default Java release's vanilla datapack. A cache that holds another release but not the default now reports the default datapack missing instead of loading the other release.
