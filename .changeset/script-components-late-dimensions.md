---
'@jsprismarine/prismarine': patch
---

A pack block's custom components run in the Nether, the End and every dimension a level builds after its scripts start. `onPlace` and `onBreak` used to fire only in the dimensions loaded at startup, so a block with `minecraft:tick` placed elsewhere never ticked. Bedrock Dynamic Lights' light blocks there never cleared themselves away. `Level.eachWorld` calls a listener with every world the level has built and with each one it builds later.
