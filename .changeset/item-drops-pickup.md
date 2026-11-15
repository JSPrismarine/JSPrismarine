---
'@jsprismarine/prismarine': patch
---

Fix dropped items in survival play. A block's drop no longer rises into the block above it and stays hidden there until that block is mined too, which also lost drops from ore veins and tunnels. Dropped items collide with their whole box and are pushed out of a block they end up inside. Explosions destroy dropped stacks, except items that resist explosions. `/replaceitem` gives the stack the count of its slot, and using a held item on an entity resizes the item in the hand, so neither leaves the client and the server disagreeing about a count.
