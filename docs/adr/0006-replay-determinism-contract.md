# The simulation replays identically at any host speed

Status: accepted

Given an initial-state manifest, the random state and an ordered inbound packet trace, a replay produces the same per-tick replay digest series and the same outbound packet digests on every run, however fast the host is. The contract does not extend across code versions, Node or V8 versions, or platforms, because floating-point and library behavior can differ between them. The replay digest covers authoritative state only. Spatial indexes, tracking sets and dirty flags are derived from that state, so they stay out of it, and a derived structure can change without changing the digest.

The server's first job is to behave like the Minecraft players know while following Mojang's releases through data. A replay is the one check that catches a behavior change no unit test names, and it only works when two runs of the same input agree. The replay suites (`SessionReplay.test.ts` and the entity AI replay) are therefore the acceptance check for any change to the simulation core.

The outbound packet digest covers the packets replication produces from a tick's change log ([ADR 0016](0016-replication-reads-the-change-log.md)), and each packet counts toward the tick whose log produced it, not the tick in which the transport framed it. Chunk streaming and the replies of read-lane handlers ([ADR 0009](0009-external-inputs-enter-once-per-tick.md)) stay out of the digest. They answer one connection from state the replay digest already covers, and they leave when the request arrives, which no tick decides.

Two runs can disagree today. Block updates and scheduled ticks stop on `performance.now()` budgets (20 ms in `World.ts`, 25 ms in `WorldSystems.ts`), so a slow host defers work that a fast host runs in the same tick. Wall-clock time must not decide what the simulation does. Count budgets are allowed, because the same input produces the same count on every host.
