---
"@jsprismarine/prismarine": minor
---

Send sounds, particles, level events and actor events from the change log. `WorldChangeSink` loses `blockSound`, `namedSound`, `namedParticle`, `worldEffect`, `actorEffect` and `actorSound`, and gains the tick phase `flushOccurrences`: a world logs each of these as an occurrence, and the sink reads them from `tickSealed` and sends them after the tick seals, ahead of the block changes. A custom sink that recorded them reads the occurrences of each sealed tick instead. The entity host loses `playerImpulse`: the motion for a shove on a player goes out from its `impulse` occurrence.

The relays of a client's arm swing, emote and sounds go the same way, through the new `World.relayAnimation`, `World.relayEmote` and `World.relaySound`, and each is encoded once for each protocol version and compression its audience uses rather than once for each player. An occurrence made between ticks is sent with the next tick. Clients get the same packets in the same tick. A sound, a particle or an event made by a unit of work that failed and was undone is no longer sent. An actor event for an entity removed later in the same tick, such as a killing blow's hurt flash, still reaches the players that tracked it, ahead of the entity's removal.
