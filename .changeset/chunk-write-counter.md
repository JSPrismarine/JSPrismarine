---
'@jsprismarine/prismarine': patch
---

Count block writes per chunk, so a write in one chunk no longer makes every other loaded chunk sum its section revisions again for its random tick sections and its block revision. A fluid flowing anywhere used to cost each loaded chunk a pass over all 24 sections every tick.
