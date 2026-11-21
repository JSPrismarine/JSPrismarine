---
'@jsprismarine/worldgen': patch
---

The surface pass runs the material rule tree as one flat array of ops instead of a chain of closures, and compiles it once per tree rather than once per chunk. The blocks it places are the same.
