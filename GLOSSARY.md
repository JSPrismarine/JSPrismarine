# JSPrismarine

A dedicated Minecraft Bedrock Edition server. Its gameplay comes from data, Bedrock behavior packs and Java Edition data, so it can follow Mojang's releases without reimplementing the rules.

## Language

### Entities

**Entity**:
Anything that exists in a world and is not a block: a mob, a player, a dropped item or a projectile.
_Avoid_: actor (outside protocol code), mob (when you mean every kind)

**Entity store**:
The one per-world collection that holds every entity in that world.
_Avoid_: entity map

**Network session**:
One player's connection to the server, kept separate from that player's entity.
_Avoid_: client

### History and actions

**Change log**:
The ordered record of every change to a world's authoritative state, one entry per change with its before and after values, addressed by tick and sequence number.
_Avoid_: event log, journal

**Span**:
The change log entries one unit of work appended, such as one entity's update or one applied input. A unit that fails is undone by inverting its span.
_Avoid_: transaction, batch

**Replica**:
Replication's own copy of the fields clients are sent for each entity, built only from the change log.
_Avoid_: shadow state, mirror, cache

**Save cut**:
The tick boundary whose authoritative state one save pass writes.
_Avoid_: checkpoint, snapshot point

**Intent**:
Plain data that describes an attempted action before anything has validated it.
_Avoid_: request, command

### Determinism

**Tick**:
One step of a world's simulation, and the unit its history is recorded in.
_Avoid_: frame, update

**Input step**:
The point at the start of a world's tick where every input the world admitted for that tick is applied.
_Avoid_: poll, intake

**Lane**:
When a serverbound packet handler runs, declared by the handler. The connection lane and the read lane run when the packet arrives, and the input lane runs in the input step.
_Avoid_: queue, priority, channel

**Authoritative state**:
The state the simulation reads and writes to run a tick: chunks, entity records, pending simulation work and player inventories. Indexes, tracking sets and dirty flags are derived from it and are not part of it.
_Avoid_: world state, game state

**Replay**:
A run of the server from an initial-state manifest, a random state and an ordered inbound packet trace, used to check that behavior did not change.
_Avoid_: playback, recording

**Replay digest**:
A hash of one world's authoritative state at the end of a tick. Two runs of the same replay produce the same series of digests.
_Avoid_: checksum, state hash
