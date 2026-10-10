---
'@jsprismarine/prismarine': patch
'@jsprismarine/math': patch
---

Send positional packets only to the players near them, and stop sending several of them to the entire server.

Nothing filtered by distance. Two players ten thousand blocks apart still received each other's movement, each other's block updates and each other's sounds, and each other's arm swings. The code knew: `World.sendWorldEvent` and `World.sendActorEvent` both carried a `// TODO: Limit distance`, the second of them reading "as with every other broadcast here".

Several of those broadcasts were worse than world-wide. Block placement, the animate handler, the disconnect despawn loop, the pairwise spawn at join and `Player.sendSettings` all went through `SessionManager.getAllPlayers()`, so they reached every player on the server regardless of which world they were in. Latent while only one world is loaded, and a wall in front of any multi-world work.

Recipients are now chosen in one place. `World.getViewers(position, options)` answers "who should be told about this", and `World.broadcast` and `World.broadcastAround` are the two ways to reach them; `Server.broadcastPacket` stays as the genuinely global channel for the player list, the command tree and shutdown. Chat, the time of day and the command tree are unchanged.

The test is done in chunk space against the recipient's own negotiated view distance, not against a fixed radius and not against the set of chunks the server believes it has sent. That last option is nominally the most accurate and is the wrong trade: `loadedChunks` is only marked once a batch has finished compressing and is never marked if that compression fails, so building entity visibility on it makes a compression failure show up as permanently invisible mobs. Being slightly too generous costs a packet the client discards on its own; being too stingy costs an entity that is never drawn. The chunk test is circular rather than square because `needNewChunks` loads terrain on `dx² + dz² > viewDistance²` — what a client holds is a disc, so a square test would send updates for four corners it has no ground for. Both cost the same arithmetic.

Entity visibility follows vanilla in being per type rather than one radius for everything. `Entity.getTrackingRange` and `getTrackingInterval` default to 8 chunks and 3 ticks; players override to 32 chunks — past any view distance, so the viewer's own radius decides — and dropped items to 6 chunks and 20 ticks. Items are the reason this matters: they are the most numerous entity in any world and the least worth seeing at a distance, and one mob farm at the generic radius streams thousands of them to everybody nearby.

Each session now tracks which entities its client actually holds, reconciled when the player crosses a chunk boundary and every few ticks otherwise, with hysteresis between the radius at which an entity appears and the one at which it goes away — with a single radius a player standing on the boundary produces an `AddActor` and a `RemoveActor` for everything out there on alternating passes. Entities are recorded as tracked only after their spawn has reached the wire, so a failed spawn is retried rather than being remembered as delivered and never sent again. Movement is gated on that tracked set rather than on distance: a `MoveActorAbsolutePacket` for a runtime id a client was never given is discarded at the other end anyway, which makes tracking both the correct gate and a set lookup instead of arithmetic on the hottest path in the server.

`proximity-broadcast: false` turns the filtering off. It restores world-wide delivery, not the server-wide fan-out, which was a bug rather than a behaviour. `entity-tracking-hysteresis` and `entity-tracking-interval` tune the rest.

Three bugs came out of the audit that had nothing to do with distance:

`Player.sendSettings` sent one player's `UpdateAdventureSettingsPacket` to every other client. That packet has no target actor field at all — it describes the client receiving it — so a single spectator set `worldImmutable`, `noAttackingPlayers` and `noAttackingMobs` on everybody else on the server. `PlayerSession.sendSpawn` had the same defect the other way round, pushing the *viewer's* settings onto the player being spawned on every spawn. Adventure settings now go to their own client only; `UpdateAbilitiesPacket`, which does carry `targetActorUniqueId`, still reaches everyone who can see the player.

The chat listener was never unregistered. It was registered with `this.chatHandler.bind(this)` and removed by passing the naked method, which is a different function object, so every disconnected player stayed subscribed to chat for the life of the process.

`CoordinateUtils.fromBlockToChunk` was `v >> 4`, and `>>` converts through `ToInt32`, which truncates towards zero. Entity positions are floats, so anything standing between -1 and 0 was placed in chunk 0 rather than chunk -1.

Performance, alongside the reduction in recipients:

Broadcasts compress once. `Server.broadcastPacket` was a serial `await` in a loop that built a fresh `BatchPacket` per recipient, so one `UpdateBlockPacket` going to twenty players was twenty runs of zlib over identical bytes, each waiting on the one before it. `MinecraftSession.sendSharedBatch` frames bytes somebody else encoded, through the same ordering chain so it cannot overtake a chunk batch still compressing.

`needNewChunks` no longer runs every tick. It rebuilt a heap of a few hundred candidates twenty times a second per player, for a player who had not moved a block; it now runs when the player changes chunk, which is the same signal that drives entity visibility.

A tick's movement is deduplicated per entity. `Entity.setX`, `setY` and `setZ` each announce a move of their own, so a single diagonal step queued three identical packets naming the same destination.

`SetTimePacket` goes out once a second instead of twenty times a second. The client runs its own day cycle in between, which is why the packet is in the default `log-excluded-packets` in the first place.

Dead code removed: `Player.chunkSendQueue`, a `Set<Chunk>` never read or written that shadowed the real queue on `PlayerSession` by name; `PlayerSession.sendChunk`, which had no callers and was superseded by `flushChunkBatch`; and `DataPacket.getAllowBatching`, which read a field nothing ever set. `PlayerSession.send` now returns its send instead of dropping the promise, so awaiting a broadcast means something and framing errors are no longer swallowed. `PlayerSession.broadcastMove` is renamed `sendMove`, since it sends to one session and the fan-out of that name lives on `World`. `SessionManager.getAllPlayers` now filters on `isOnline()` as `World.getPlayers` already did, so a connection still in the login handshake is no longer among the recipients of every broadcast.

`Vector3` gains `distanceTo` and `distanceSquaredTo`. There were five hand-rolled copies of that arithmetic across the server using three different metrics.
