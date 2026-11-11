---
"@jsprismarine/packs": patch
---

Resolve `decompress` to the maintained `@xhmikosr/decompress` fork in the workspace. The original 4.2.1, pulled in by the optional `@spyglassmc/core` peer, lets a crafted archive read or write outside the extraction directory through link entries and sibling-prefix paths, and keeps setuid and setgid bits. The override protects this repository's builds and tests. Projects that install `@spyglassmc/core` next to `@jsprismarine/packs` should add the same override themselves.
