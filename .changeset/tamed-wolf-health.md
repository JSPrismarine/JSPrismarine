---
'@jsprismarine/entities': patch
---

A tamed wolf has Java's 40 maximum health. Java's stat for the wolf type is the wild wolf's 8, and it used to overwrite the health group the pack adds once the wolf is tamed. `JAVA_STATE_STATS` now lists the component groups whose stat Java's class sets for the state they stand for, and a component such a group adds declares that value.
