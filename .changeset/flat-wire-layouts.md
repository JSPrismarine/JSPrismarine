---
'@jsprismarine/protocol': patch
---

Move the bodies of the flat packets onto declarative wire layouts. Each class keeps its payload
shape and writes the same bytes. The layout definitions, such as `animateEntityPacket` and
`unlockedRecipesPacket`, are now exported from the package.
