---
'@jsprismarine/prismarine': patch
---

A Java Edition client sees a Bedrock-only block that nothing collides with, such as a pack's light block, as a Java `minecraft:light` block at the same light level, or as air when the block gives no light. It used to be sent as stone, so a Java player was shown a block that is not there and pushed into a crawl under it.
