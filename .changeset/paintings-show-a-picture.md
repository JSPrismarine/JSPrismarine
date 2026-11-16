---
'@jsprismarine/prismarine': patch
'@jsprismarine/item-behaviors': patch
---

Hang paintings as Java's `Painting.create` does: a placed painting shows one of the `minecraft:placeable` variants that fit its wall with the largest area, drawn at random, and none is placed where no picture fits. The painting item hangs one only on a wall face and keeps the stack when nothing fits, through the new optional `hangPainting` on the item world. Clients are now shown a painting with `AddPaintingPacket`, by the motif their resource pack names the picture, at the center of its face.
