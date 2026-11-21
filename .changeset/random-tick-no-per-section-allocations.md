---
'@jsprismarine/engine-systems': patch
'@jsprismarine/prismarine': patch
---

Random ticks no longer allocate per section per tick. The server hands out one reusable section reader and one random tick lookup per content build, and keeps each chunk's section corners until its section list changes. A host may now return the same `sectionRandomTickIds` reader for every section.
