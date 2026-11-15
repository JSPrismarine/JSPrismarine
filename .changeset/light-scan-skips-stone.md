---
'@jsprismarine/lighting': patch
---

Stop a chunk load's column scan below the column's height in sections whose palette emits no light. A column of stone was read block by block to the floor looking for light sources its section hints already ruled out.
