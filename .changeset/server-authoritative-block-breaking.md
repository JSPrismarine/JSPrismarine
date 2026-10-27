---
'@jsprismarine/prismarine': patch
---

Support both block breaking modes, chosen by the new `server-authoritative-block-breaking` setting.
It is on by default, as a Bedrock Dedicated Server 1.26.52 runs it, and `StartGame` announces it.

On, the client reports a break as `PREDICT_DESTROY_BLOCK` inside `PlayerAuthInput`, and the server
carries it out. The server animates the cracks itself: when mining moves to a new block it stops the
cracks on the old one and starts them on the new one, then every tick it sends the particles off the
mined face and the crack progress. The cracks stop when the player lets go, disconnects, dies, or
changes game mode or world, and when the block changes under them. A transaction claiming a block
broke is dropped in this mode. An adventure player's predicted break is refused, and the client is
sent the block back.

Off, the client times the break and reports it with an `InventoryTransaction`, as before.

In both modes the player breaking a block no longer gets the server's hit sound on top of the one
their client plays, which made digging sound several times too fast. A break, including one a
command makes, now sends one `PARTICLES_DESTROY_BLOCK` event for its particles and sound, as BDS
does, instead of a sound packet plus the silent event.
