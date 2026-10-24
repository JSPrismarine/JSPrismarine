---
'@jsprismarine/prismarine': patch
---

`PlayerActionHandler` drops a `PlayerActionPacket` whose `Player Runtime ID` is not the sender's, ignores the block-breaking actions that a 1.26.51 client only sends inside `PlayerAuthInputPacket`, toggles flight for `StartFlying` and `StopFlying`, and accepts the dimension change ack and the swimming, gliding, crawling, sleeping and spin attack actions without logging them as unhandled.
