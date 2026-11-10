# Replication reads the change log after the tick

Status: accepted

Replication is a read-only stage that runs after a tick closes. It reads the tick's change log ([ADR 0012](0012-the-change-log-is-the-history.md)) and nothing else from the simulation. It computes the audience for each change once per tick, encodes once for each protocol codec and compression group, and sends. It never compares current state with the values it last sent. Handlers and other simulation code stop sending packets per viewer. An occurrence such as an animation or a hurt effect is a log entry, and replication turns it into packets.

A player who walks into range of an entity that has not changed needs that entity's full state, and no entry of the current tick carries it. Replication therefore keeps a replica: the fields clients are sent for each entity, folded from the log. A membership entry carries the entity's full replicated state, so the replica starts complete and every later entry updates it. A first sight is answered from the replica, and the spawn packet is encoded once for each codec group, not once for each viewer. The replica holds only what the log already delivered, so replication still reads nothing else from the simulation, and it is the plain data a worker would need.

Today health crosses between a mob's two models by comparing the body's value with the last one the mirror wrote. Handlers such as `AnimateHandler` encode and compress once per viewer, although the replicator already has an encode-once path. Replication also reads entity objects directly. Reading a plain-data log removes the comparison, the per-viewer encoding and the dependency on entity objects, and it lets the stage move to another thread later ([ADR 0011](0011-a-world-exchanges-only-plain-data.md)).

The test is a count. The number of encode calls for one broadcast occurrence equals the number of codec and compression groups, whatever the number of viewers.
