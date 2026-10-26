---
'@jsprismarine/prismarine': minor
---

Answer inventory requests the way a Bedrock Dedicated Server 1.26.52 does. Each stack now keeps its
own stack network id: a stack moved whole keeps it, a part split off gets a new one, and a stack
merged onto another keeps the destination's. `InventoryContent` and `InventorySlot` carry the ids,
and each player's ids come from their own counter, `HumanInventory.assignStackNetworkId`. A stack
put on the ground loses its id, so it cannot name another player's stack once picked up. Answers
name each slot in the container and slot number the client used, in the order the request touched
them, and leave out the craft's output slot.

A craft spends the grid through the client's `CRAFTING_CONSUME_INPUT` steps, and a request whose
steps spend less than the recipe costs is refused. The result waits in the created output, the only
source a step can take it from, and a step takes no more than the craft made: one craft used to
place as many as the step asked for. `CRAFTING_RECIPE_AUTO` crafts as many times as it repeats. A
stack can move into and out of the offhand, a refused request puts back armor and the offhand, a
drop takes only as many as the step names, and a creative pick or craft dropped onto a different
item is refused instead of replacing it.

Breaking: `PlayerSession.sendCraftingSlot` is gone. BDS sends no crafting-slot packets after a
craft, and the answer to the request now covers the grid.

A recorded BDS session of 69 requests is replayed as a test, and every answer matches, stack ids
included.
