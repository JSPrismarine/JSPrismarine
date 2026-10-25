---
'@jsprismarine/block-behaviors': patch
---

Leave an emptied flower pot reading as empty.

`flowerPotFamily.onPlayerInteract` set `update_bit` right after taking the plant out. On a flower
pot `update_bit` is the contents flag and `false` is an empty pot, so the pot ended every
interaction claiming to hold the plant the player had just removed.

It was on the wire too. The write moved the runtime id, so the server sent a block-change packet
carrying `minecraft:flower_pot[update_bit=1]`, a state the Java-to-Bedrock table never emits: all
40 Java `potted_*` blocks and the empty `minecraft:flower_pot` collapse onto `update_bit=0`,
because the plant travels in the block entity's `PlantBlock` rather than in the state. The write
also took the pot's block entity with it, since writing a block clears the block entity at that
position, so the `{ items: [undefined], capacity: 1 }` record the family had just written was
gone again a line later.

Emptying a pot now writes `update_bit: false`. Measured over the real content adapter and a real
`World`: the state after emptying went from `update_bit=1` to `update_bit=0`, the block-change
packets went from 1 to 0 because the write no longer moves the runtime id, and the pot keeps its
block entity with one empty slot. A pot that arrived with the flag set, from a command or an
imported world, is corrected rather than left lying.
