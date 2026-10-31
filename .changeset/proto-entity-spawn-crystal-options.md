---
'@jsprismarine/chunkgen': patch
---

`ProtoEntitySpawn` carries an end crystal's spawn options: the beam target, the base plate flag
and invulnerability. The fields are optional and additive, and they survive `transfer` and
`adopt` like the rest of the spawn, so a generated End pillar's crystal keeps its configuration
across the worker boundary.
