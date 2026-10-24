---
'@jsprismarine/prismarine': patch
---

`MobEquipmentHandler` checks what a client reports before acting on it. A packet naming a
container other than the player inventory or the offhand is dropped, and so is one whose slot or
selected slot lies outside the nine hotbar slots. An offhand report is accepted and ignored,
since the off hand is kept through item stack requests. A valid hotbar change now reaches the
other players in the sender's world that have the sender on screen, as a `MobEquipmentPacket`
carrying the server's copy of the stack in that slot rather than the one the client claimed.
