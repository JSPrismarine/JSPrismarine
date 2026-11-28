---
'@jsprismarine/protocol': patch
---

Write a pack block's `StartGame` block properties as BDS 1.26.60.6 does: each trait in its own shape, with every state of `minecraft:placement_direction` and `minecraft:placement_position` named and `minecraft:connection` as the int 1, `bone_visibility` written as `"true"` or `"false"` as a float, `blockTags` in name order, a collision box's x axis mirrored from the file's, and `minecraft:item_visual` sent as its own geometry and material instances. The Sift's slabs, stairs, fences and portal now reach the client as BDS sends them.
