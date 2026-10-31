---
"@jsprismarine/block-behaviors": patch
---

Give a placed trapdoor its facing and half, matching Java's `TrapDoorBlock` placement rule: a side click hangs it on the clicked face, a vertical click opposes the placer, and a click in the upper half of a face or on the underside of a block sets `upside_down_bit`. Trapdoors kept the palette default because no family wrote the states.
