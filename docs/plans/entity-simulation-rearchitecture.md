# Entity and tick re-architecture: one entity model, one tick pipeline

Status: in progress. The decisions were taken on 2026-11-10 and this plan was written the same day. Counts in this page are from that day. Slices 0 to 2 have landed on the program branch (`t3/subagent-architecture-review`, pull request #2948), and slices 3 to 5 were in progress when work moved to another machine on 2026-11-10. [The handoff](entity-simulation-rearchitecture.handoff.md) says where each package stands and how to pick it up.

The server runs two simulations of the same world and reconciles them every tick. Every data-driven mob lives once in `EntityRuntime` and a second time as a legacy body in the world's entity map, and health crosses between the two by comparison. Two entity indexes answer the same question under opposite rules. A tick awaits at 233 points, so a packet handler can change a player in the middle of it. This plan replaces all of that with one entity store, one index, a synchronous tick, and replication that reads a change log.

The decisions are in ADRs 0006 to 0018. This page holds what does not fit an ADR: what the review changed, the order of the work, how each slice is judged, and what is still unknown.

## Priorities

1. The server feels like Minecraft and mostly is Minecraft, and it keeps up with Mojang's releases. That is why behavior comes from data and not from reimplementation.
2. Performance, a close second.
3. The program finishes. No slice ends with mobs on one model and players on another, and the slices that create a temporary mix are planned as one commitment.

## Decisions

- [ADR 0006](../adr/0006-replay-determinism-contract.md): a replay gives identical digests at any host speed.
- [ADR 0007](../adr/0007-one-entity-index-visible-on-write.md): one entity index, and a write is visible to the next query.
- [ADR 0008](../adr/0008-one-entity-model.md): one entity model, with players and items in the same store.
- [ADR 0009](../adr/0009-external-inputs-enter-once-per-tick.md): external inputs enter once per tick and are recorded, and a handler's lane decides whether its packet is an input.
- [ADR 0010](../adr/0010-no-barrel-files.md): no barrel files, and explicit package exports.
- [ADR 0011](../adr/0011-a-world-exchanges-only-plain-data.md): a world exchanges only plain data with the outside.
- [ADR 0012](../adr/0012-the-change-log-is-the-history.md): the change log is the history, complete and invertible.
- [ADR 0013](../adr/0013-vetoable-actions-are-staged.md): vetoable actions run as intent, guard, compute and commit.
- [ADR 0014](../adr/0014-handlers-share-a-shape-and-run-in-the-input-step.md): handlers share one shape, and input-lane handlers run in the input step.
- [ADR 0015](../adr/0015-a-tick-is-a-fixed-sequence-of-synchronous-phases.md): a tick is a fixed sequence of synchronous phases.
- [ADR 0016](../adr/0016-replication-reads-the-change-log.md): replication reads the change log after the tick and keeps a replica.
- [ADR 0017](../adr/0017-one-lifecycle-event-bus.md): one lifecycle event bus.
- [ADR 0018](../adr/0018-a-save-is-a-snapshot-of-one-tick-boundary.md), proposed: a save is a snapshot of one tick boundary.

## What the review changed

The first version of this plan left ten gaps. Each one is closed below, with the evidence that closed it. Seven of them changed an ADR.

### Replication needs more than the current tick's log

A player who walks into range of an entity that has not changed needs its full state, and the current tick's log has no entry for it. Today `spawnTo` reads position, rotation, metadata, attributes, equipment and effects from the live entity object and encodes a spawn packet for each viewer. Nothing caches replicated state.

Replication now keeps a replica, built only from the log. A membership entry carries an entity's full replicated state, and later entries update it. A first sight is answered from the replica and encoded once for each codec group. Replication still reads nothing from the simulation except the log, which keeps it movable to a worker. The cost is a second copy of the client-visible fields of each loaded entity, counted as replica entries and bytes. ADR 0016 records this.

### Invertibility needed a scope and a use

ADR 0012 priced the before-values at three numbers for a moving entity, and authoritative state also includes blocks, inventories and block entities. Nothing in the program read a before-value.

Three things close this. First, the log has three entry kinds with stated inverses, and a chunk that enters the world is named in the log and not carried by it, because it arrived as an input. Second, a unit of work that throws is undone by inverting its span, which gives invertibility a use and a test inside the program and also closes the failure gap below. Third, this program keeps a tick's log only until replication and the save cut have read it. The before-values then cost memory for one tick and nothing on disk. Slice 2 reports deltas and bytes per tick on the replay scenarios as a non-gating count, so the retention work that comes later starts from real figures.

### The tick was audited for awaits

The handlers had been audited and the simulation had not. An audit of everything reachable from `World.update` found 233 awaits and about 20 promises the tick starts without awaiting.

| Class                                         | Awaits | What removes them                                             | Slice   |
| --------------------------------------------- | ------ | ------------------------------------------------------------- | ------- |
| Packet sends                                  | 77     | Sends become entries in the change log                        | 7       |
| Functions that are async only to pass a wait on | 120    | They become synchronous once the waits below them are gone    | 3 to 9  |
| Chunk or block reads that may load a chunk    | 21     | Loaded-chunk accessors, chunk tickets and waiting states      | 3, 5, 9 |
| Disk reads and writes                         | 4      | Chunk loads as inputs, saves under ADR 0018                   | 8, 9    |
| Awaited events                                | 3      | Guards under ADR 0013                                         | 4, 9    |
| Other waits                                   | 8      | Worlds built outside ticks, completion results as inputs      | 9       |

Most of the 233 are mechanical. The simulation never reads the result of a send, and `WorldSystems.tick`, `RaidManager.tick`, cooking stations, spawners, `EntityRuntime.tick` and the block-behaviors, engine-systems, lighting, spawning, entities, entity-goals and entity-brains packages contain no asynchronous code today.

Three sites are hard, and each needs a mechanism this plan now names.

- Portal transfer runs inside an entity's update (`Entity.ts:526`). It can build a dimension, generate chunks, raise a cancellable event and save player data. It becomes the message of ADR 0011: the source world commits the departure in its tick, and the destination admits the arrival as an input once its chunks are ready.
- Respawn search runs inside `onDeath`, which runs inside `damage` (`Player.ts:988`). It is why every caller of `damage` is asynchronous, and the runtime starts `damage` without awaiting it. Death commits in the tick. The respawn point becomes a request to a world service, and its answer returns as an input.
- The dragon fight loads its arena, gateway and pillar chunks inline (`DragonFight.ts:390`, `:512`, `:565`). It takes chunk tickets and gets explicit waiting states.

Unloaded chunks are already handled the right way by most of the simulation. Block updates skip them, fluids and scheduled ticks read air and have their writes refused, and explosions and data-driven mobs read only loaded chunks. The code that loads a chunk from inside a tick is the legacy item entity, the player breath check, the dragon fight, portal travel and `World.setBlockRuntimeId`.

Each slice removes the awaits in the code it rewrites, and the count is reported from slice 1 on. The test that a tick completes without yielding can only pass at slice 9.

### The temporary mix was too long

The first version kept a transitional adapter over legacy entities from slice 2 to slice 8 and deleted the legacy classes at the end. The legacy classes now go in slice 5, when players move, so the adapter lives for slices 2 to 5. Those four slices are one commitment. Slice 2 does not start until the work through slice 5 is planned.

Slice 5 is where the program is most likely to stall, because `Player` carries the entity, the connection, the saved record and server-wide chat and permissions. A spike before slice 2 puts one player-shaped entity into a prototype store, with an inventory, a network session that the entity references and a save and load round trip. The spike is thrown away. If it shows that a player cannot be expressed in the shape of ADR 0008, that ADR is reopened before any store code lands.

### One input step would have throttled chunk streaming

Of the 72 handler classes, 19 write authoritative state, 15 read it without writing, and 38 touch only their own connection. A sub-chunk request is answered in handler context today. Under one input step for every packet it would wait for the next tick and slow down with the tick rate.

ADR 0009 now defines three lanes. The connection lane and the read lane run when the packet arrives, and only input-lane packets are inputs. Four of the 15 readers relay something other players see (`ActorEvent`, `Animate`, `Emote`, `LevelSoundEvent`), so they belong in the input lane, where the relay becomes a log entry. The read lane is for handlers that reply only to the sender. `LevelChunk` delivery already runs from its own scheduler outside the tick and stays there.

The read lane narrows the outbound digest in ADR 0006. The digest covers what replication produces from the log, counted toward the tick that produced it. Read-lane replies and chunk streaming are outside it, because no tick decides when they leave. Today's recorder stamps a packet with the tick in which the transport framed it, which slice 7 changes.

### Guards have to replace parameters

The first version of ADR 0013 said a scripting before-hook could only pass or veto. In `@minecraft/server` 2.11.0, ten of the seventeen stable before-events let a script rewrite a parameter, such as the damage of `EntityHurtBeforeEvent` or the block list of `ExplosionBeforeEvent`. Bedrock add-ons are the primary way to extend the server, so a pass-or-veto rule would have ruled out a faithful host.

A guard now returns pass, veto or replacement values for the parameters its pipeline declares replaceable, and still writes no state. That matches the documented restricted execution of before-event callbacks. ADR 0017 changed for the same reason. Bedrock runs a `system.run` callback at the end of the same tick, so the ADR no longer places it in the next input step and leaves the point to the Script API host design.

### Saves had no rule

A save pass mixes ticks today. Autosave starts in the middle of a tick, captures every player at that instant and then serializes chunks eight at a time across later ticks. A crash can leave an item in a saved inventory and also in a chest saved later. An entity that changes chunk during the pass can be written twice or not at all.

ADR 0018 proposes that a pass writes the state of one tick boundary and commits it as one atomic write. It is proposed and not accepted, because the commit is a synchronous LevelDB append on the server thread and its size is unknown. Slice 8 measures the bytes in a pass before the ADR is accepted.

### A failed update left partial writes

ADR 0015 skipped an entity that throws and assumed the store stays consistent. An update that throws halfway has already written. The store now undoes the span of the unit that threw before it skips the entity, as described under invertibility above.

### Slice 1 promised too much, and proxies had no slice

Slice 1 was named "trustworthy replay", and replay is not fully trustworthy until the tick is synchronous. The slice list below says what replay guarantees after each step, and the target table names the slice at which each proxy starts to gate.

## Slice order

Every slice lands on `master`, and a slice deletes what it replaces. The one exception is the adapter over legacy entities, which slice 2 adds and slice 5 removes.

0. **Barrel ban.** Biome's `noBarrelFile` and `noReExportAll` with a baseline that only shrinks. No code changes. This slice is independent of the others and can land at any time.
1. **Tick boundaries.** Every handler declares a lane. The dispatcher holds input-lane packets, and the ticker applies them at the start of the next tick in arrival order, which is what the replay harness already does when it injects. Capture stamps a packet with the tick that applied it. Chunk completions are recorded as inputs. Counts replace the 20 ms and 25 ms budgets. Worlds tick one after another in a fixed order, and a failing world does not skip the next. Handlers are still asynchronous here, so a tick can still yield, but no handler runs in the middle of one. After this slice, live play and its replay apply the same inputs at the same ticks.
2. **The entity store.** The store, setters that append entries with before-values, spans and their inverses, the one index, and the adapter over legacy entities. The player spike comes first.
3. **Items and the eye of ender** move into the store with built-in definitions. The item ground probe stops loading chunks.
4. **Staged damage and death.** The store owns damage and death under ADR 0013, with replaceable parameters. The mirror and the health comparison are deleted. `damage` becomes synchronous, which removes the promises the runtime starts without awaiting. Respawn search becomes a world service request.
5. **Players** move into the store, split into components, a network session and services for chat, permissions and persistence. `Entity`, `GenericEntity`, `Human`, the `Player` class and the adapter are deleted. No legacy entity remains after this slice.
6. **Handlers.** The shared shape, a narrow context and synchronous input-lane handlers. The client package adopts the shape.
7. **Replication reads the log.** Block and block entity writes go through logged setters, so the log is complete. Replication builds its replica, computes each audience once and encodes once for each codec group. Sends leave the simulation, which removes the largest class of awaits. Outbound packets count toward the tick that produced them.
8. **Saves at a tick boundary**, if ADR 0018 is accepted after its measurement.
9. **The synchronous tick.** Dimension travel as messages, chunk tickets and waiting states for the dragon fight, worlds built outside ticks, and tick functions admitted as inputs. After this slice a tick completes without yielding, and ADR 0006 holds in full.
10. **One lifecycle event bus.**
11. **Explicit exports.** Prismarine's barrels and its `"./*"` export are replaced.

Players come before replication so the log is complete when replication reads it. Handlers come before replication so they have somewhere to put their output. The cost of that order is that the encode-once change lands at slice 7.

## Progress

As of 2026-11-10, at program head `646dd8a4f3`, rebased on `master` `9a2c1d5af5`. Every CI check passed on `46a1d6977a`, Client E2E included.

| Package | State |
| --- | --- |
| A1 barrel ban, A2 count budgets and world order, A3 handler lanes, A4 change log module, A5 player spike | Landed |
| B1 input admission, with its two follow-up fixes (a held input blocked its connection; a stale move undid a teleport) | Landed |
| B2 chunk completions as recorded inputs, with the follow-up fix for the tick that stalled after the dragon died | Landed |
| B3a one live player per account (#2951) and the persistence service | Landed |
| B3b chat fan-out and respawn search as services | Work in progress, not landed |
| B4 save pass measurement, B5 re-keyed maps | Landed |
| C1a component state on the instance, C1b one entity index, C1c the entity store with logged setters, spans and undo | Landed |
| Replay determinism fixes (settle gaps, wall-clock chunk budget in the harness) | Landed |
| C2 items and the eye of ender in the store | Work in progress, not landed |
| C3 staged damage and death, the mirror deleted | Work in progress, not landed |
| C4 and everything in phases D to F | Not started |

## Phases and work packages

A slice is too large to hand to one person or agent, and several slices have parts that do not depend on each other. The phases below cut the slices into work packages. Packages in one phase run side by side, each in its own worktree, and a phase starts when the packages it depends on have landed. Each package commits in small steps and passes the gate below before it is rebased onto the program branch.

### Phase A: foundations

Nothing here depends on another package, and no two packages edit the same files.

| Package | Slice | Work                                                                                                                                                              | Main files                                             |
| ------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| A1      | 0     | Ban barrels with a baseline that only shrinks                                                                                                                     | `biome.json`, `scripts/`                               |
| A2      | 1     | Counts replace the 20 ms and 25 ms budgets. Worlds tick one after another in a fixed order, and a failing world does not skip the next                            | `World.ts`, `WorldSystems.ts`, `modules/ticker.ts`     |
| A3      | 1     | Every handler declares a lane, and a test checks the registry. No handler changes when it runs yet                                                                | `network/handler/`, `PacketHandlerRegistry.ts`         |
| A4      | 2     | The change log as a module of its own: the three entry kinds, spans, inverses and the one-tick lifetime, with nothing wired to it                                 | new module beside `world/`                             |
| A5      | 2     | The player spike. It is thrown away, and its findings are kept as a research note                                                                                 | `docs/research/`                                       |

### Phase B: admission and preparation

| Package | Slice | Depends on | Work                                                                                                                                                              |
| ------- | ----- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1      | 1     | A2, A3     | The dispatcher holds input-lane packets and the ticker applies them at tick start. Capture stamps the applying tick. The replay test compares two runs tick by tick |
| B2      | 1     | A2         | Chunk completions are recorded as inputs                                                                                                                          |
| B3      | 5     | none       | Player persistence, chat fan-out and respawn search move out of `Player` into services keyed by player identity, while `Player` is still a legacy entity          |
| B4      | 8     | none       | Measure the bytes in a save pass and confirm what a saved player record copies, so ADR 0018 can be accepted or changed                                            |
| B5      | 5     | none       | Re-key the seven maps keyed by the `Player` object by player identity or entity id |

B1 and B2 both edit the ticker, so B2 follows B1. B3, B4 and B5 run beside them.

The lane declarations of A3 put 35 handlers in the connection lane, 9 in the read lane and 28 in the input lane, and left B1 these rules.

- An input-lane packet is applied in the input step of the world its sender's entity is in. An effect on another world leaves as a message under ADR 0011 and is admitted at that world's next input step.
- Server-wide state that is not a world's authoritative state, such as the operator list, the default game mode and chat fan-out, changes in memory when the handler runs and persists off the tick.
- A player's removal is an input, whether a `Disconnect` packet or a closed transport caused it.
- `SubChunkRequest` can load a chunk the world evicted. The handler may wait for it, and the loaded chunk is admitted through the completion queue like any other.
- `Login` and `ClientToServerHandshake` stay in the connection lane although they read the default world's spawn and build the player. That work moves in front of the join in slice 6.

Slice 6 inherits a list of what stops an input-lane handler from being synchronous. Eight handlers load chunks or search for a position, among them `PlayerAction`, `InventoryTransaction`, `ItemStackRequest`, `Respawn` and `RequestChunkRadius`. Six reach the disk through `savePlayerData`, the operator file or the config. `Text`, `CommandRequest` and `SettingsCommand` call into commands and chat, which can do anything. Six read-lane handlers are write requests the server drops today, and each moves to the input lane when its write is implemented.

B2 left three things for later slices to remove.

- `world/TickContext.ts` uses `AsyncLocalStorage` to tell code inside a tick from code between ticks, because the tick still awaits. Slice 9 makes the tick synchronous, and a plain flag set by the ticker replaces it then.
- Eight code paths still load a chunk from inside a tick. Each is admitted inline, recorded as `inline` and listed in `IN_TICK_CHUNK_LOADS`, and a test fails when one is removed without updating the list. Slices 3, 5, 6 and 9 remove them.
- `World.disable` waits for an unload parked on admission, so calling it from inside a tick would never finish. Nothing does today. Slice 9 has to keep it that way or drain admissions first.
- A tick that awaits work started outside it, such as from an event or a command between ticks, cannot be told apart from one that waits for its own chunks, and a chunk that work loads waits for the next input step. The ticker therefore admits every held completion inline, recorded as `inline`, and logs a `TickStalledError` each `TICK_STALL_MS` a tick runs with completions held. Slice 9's synchronous tick removes the wait and the watch with it.

C1a and C1b left these for later packages.

- C1a moved component state the entities package hid in `WeakMap`s onto `EntityInstance.componentState`, with one write path that reports each write's before and after values to `EntityEnvironment.componentStateWritten`. `target_nearby_sensor` keeps a runtime id there, and runtime ids are drawn again each session, so C1c marks that field as not saved until the store has ids that survive a reload.
- C1b left one index per dimension (`EntityIndex`, `World.getEntityIndex()`), and chunk membership as a second structure written only by `World.entityRelocated`. Membership follows the client body and the index follows the runtime's position, so the two agree again once C3 deletes the mirror. Until then legacy explosions search four blocks beyond their reach.
- Viewer tracking still passes every entity in the world to `EntityTracker.plan`. D4 replaces that with audiences computed from the index.
- Inside the tick, `World.getEntities()` is still copied for spawner counts, the attribute flush and tracking, and `EntityRuntime.all()` is copied for the entity pass, the despawn cycle and the mirror's `sync`. Slice 5's target removes the copies.

C1c left these for later packages.

- The store is `EntityRuntime.store`, which took over the runtime's entity map, and it holds the world's change log until block writes join it in D3. A log tick is numbered by the store, not by the level clock, which `/time set` moves backwards.
- A player's inventory is not logged. A slot changes by mutating the `Item` in place and `Inventory` does not know its owner, so from slice 2 to slice 5 the replay digest covers player inventories only through its snapshot. C4c's inventory with one entry per slot closes this. Legacy position, health and game mode are logged through `entity/legacyAdapter.ts`.
- A merchant's offers are saved and hashed but not logged, because a trade changes the `Merchant` in place.
- An undo restores only what a save or the digest reads. Goal progress, pending deaths and other runtime bookkeeping stay as the throw left them.
- A chunk admitted inline inside a unit pins the unit, which then keeps its writes if it throws, until slices 3 to 9 remove the inline loads.
- Writes between ticks, such as tick functions, which run after the worlds seal, and connection-lane handlers, are counted as unlogged and not logged.
- A player whose update throws is not contained yet: legacy updates do not run as units. When players move into the store, the store's failure count disconnects the session instead of removing the entity.

### Phase C: the store

| Package | Slice | Depends on | Work                                                                                                                         |
| ------- | ----- | ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| C1      | 2     | A4, A5, B1 | The entity store, logged setters, the one index and the adapter over legacy entities. Component state the entities package keeps in `WeakMap`s moves onto the instance, where the store can log and save it |
| C2      | 3     | C1         | Items and the eye of ender move into the store                                                                               |
| C3      | 4     | C1         | Staged damage and death, the mirror deleted, `damage` synchronous                                                            |
| C4      | 5     | C2, C3, B3, B5 | Players move into the store. The legacy entity classes and the adapter are deleted. Split into the packages below |

C2 and C3 run side by side if C1 leaves item code and damage code in separate files. Otherwise C3 follows C2.

[The player spike](../research/player-entity-spike.md) found that a player fits the store with three host rules, which ADR 0008 now records, and that C4 is too large for one package. 79 source files and 117 test files name `Player`. C4 splits as follows.

| Package | Depends on | Work |
| ------- | ---------- | ---- |
| C4b | C1, C3 | The player overlay, the rule that the client owns a player's movement, and a death that keeps the entity |
| C4c | C1 | Player components with logged setters, and an inventory that logs one entry for each slot |
| C4d | C4b, C4c | Player systems: hunger, breath, fall damage, consumption and mining, reading loaded chunks only |
| C4e | C4c, B3 | Persistence from the store entity, with the saved record unchanged |
| C4f | C4c | The session holds the entity id. Convert the files that name `Player`, split by directory |
| C4g | C4b, C4c | Show store players to clients through the current replicator until slice 7 |
| C4h | C4b to C4g | Convert the tests, then delete the legacy entity classes and the adapter |

C4b and C4c run side by side. C4d, C4e, C4f and C4g run side by side after C4c. The spike's note lists what the adapter of C1 must provide while players are still legacy, and that list is part of C1's brief. One item needs an answer when C3 lands: the mirror is what shows store mobs to legacy sessions today, so from the slice that deletes it until slice 5 something else has to encode them.

The change log module of A4 left questions for C1, answered here.

- A chunk entering the world is a unit of its own. The input step admits a chunk as one input, and no other write shares its span, so a span that would have to be undone never holds a chunk entry.
- A membership entry carries one record, the entity's saved form, and that form has to contain everything replication sends on first sight. ADR 0012 and ADR 0016 describe the same record.
- Inverses are written through setters that do not log. If writing an inverse throws, the store can no longer be trusted, so the world stops ticking and reports the failure. It does not go on with a half-undone unit.
- A chest's slots are fields of its block entity, addressed by block position. An entity's inventory slots are addressed by entity id.

### Phase D: handlers and replication

| Package | Slice | Depends on | Work                                                                                                              |
| ------- | ----- | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| D1      | 6     | C4         | The shared handler shape in `@jsprismarine/protocol` and the narrow server context                                |
| D2      | 6     | D1         | Convert the input-lane handlers to the shape, split into groups that run side by side. The client adopts the shape |
| D3      | 7     | C4         | Block and block entity writes go through logged setters                                                           |
| D4      | 7     | D2, D3     | The replica, one audience per change, one encode per codec group, and sends out of the simulation                 |

D3 runs beside D1 and D2.

### Phase E: the synchronous tick

| Package | Slice | Depends on | Work                                                                              |
| ------- | ----- | ---------- | --------------------------------------------------------------------------------- |
| E1      | 8     | D3, B4     | Saves at a tick boundary, if ADR 0018 is accepted                                 |
| E2      | 9     | D4         | Dimension travel as messages, and worlds built outside ticks                      |
| E3      | 9     | D4         | Chunk tickets and waiting states for the dragon fight                             |
| E4      | 9     | E2, E3     | Tick functions as inputs, and the test that a tick completes without yielding     |

E1, E2 and E3 run side by side.

### Phase F: cleanup

| Package | Slice | Depends on | Work                                                       |
| ------- | ----- | ---------- | ---------------------------------------------------------- |
| F1      | 10    | E4         | One lifecycle event bus                                    |
| F2      | 11    | F1         | Explicit exports for Prismarine, split by directory        |

## The gate for each slice

- Typecheck, lint and tests pass.
- The parity families the slice touches pass.
- Replay digests are unchanged, or are re-baselined in a separate commit that states the intended change. Until slice 9 this compares one replay with another under the guarantees listed for the slices already landed.
- A client e2e scenario covers any client-visible change.
- The proxy tests that gate at this slice pass.
- A Changeset for each affected package follows [the versioning policy](../guide/versioning.md).
- The docs the slice invalidates are updated, such as [entities](../data-driven/entities.md), [engine systems](../data-driven/engine-systems.md) and the status in [the server re-architecture plan](server-rearchitecture.md).

## Performance targets

Each target is a count or a structure asserted in a test. None is a duration.

| Target                                                                                                   | Gates from slice |
| -------------------------------------------------------------------------------------------------------- | ---------------- |
| Every handler declares a lane, checked against the handler registry                                      | 1                |
| No wall-clock read inside the world systems phase, with `performance.now` stubbed to throw               | 1                |
| A replay applies each recorded input at the tick the capture stamped                                     | 1                |
| An index query examines at most the candidates in the cells it touches, on a fixed scenario              | 2                |
| Applying a span and then its inverse leaves the replay digest unchanged, for every entry kind            | 2                |
| An idle world appends no entries, and N walking mobs append at most N position entries in a tick         | 2                |
| No mirror class and no health comparison                                                                 | 4                |
| No `Entity`, `GenericEntity` or `Human` class, and no array copy through `all()` or `getEntities()`      | 5                |
| No `Server` import in a handler                                                                          | 6                |
| Encode calls for one broadcast occurrence equal the number of codec and compression groups               | 7                |
| Replication visits entities in proportion to log entries, not to the number of entities                  | 7                |
| A snapshot plus the log reproduces the replay digest                                                     | 7                |
| A tick makes no wall-clock read and completes without yielding                                           | 9                |
| No barrel in Prismarine                                                                                  | 11               |

Three counts are reported and do not gate: awaits reachable from `World.update`, change log entries and bytes per tick, and replica entries and bytes. They go through `reportProgress`.

## Scope notes

Handlers take a narrow context and not `Server`. Other files that take `Server` stay out of the program, unless a codemod or delegated agents can convert them mechanically with no real risk. Then they go in.

## Deferred

- The Script API host. Its before-hooks are guards under ADR 0013. A wall-clock watchdog for long scripts would conflict with [ADR 0009](../adr/0009-external-inputs-enter-once-per-tick.md), and the host design has to answer that and pick the point in a tick where `system.run` callbacks run.
- The low-level plugin form ("mods"). Keep the store's plain-data edge and the explicit exports in mind, and build nothing for it now.
- Moving replication, a world or pathfinding to another thread. [ADR 0011](../adr/0011-a-world-exchanges-only-plain-data.md) lists the candidates. A world on its own thread also moves the read lane onto the replica.
- Retention of the change log, crash recovery from it, and rollback tooling.

## Checks to run, not assumed

- Advancement triggers fire inline from the legacy damage and death methods. Reading them from the log changes when they fire, so slices 4 and 7 need a parity check on advancement timing.
- Rejecting an interaction with an unloaded chunk should match Java. The parity suite has to confirm it in slice 6.
- Counts in place of the 20 ms and 25 ms budgets mean an overloaded host ticks slower and never simulates differently. Slice 1 needs a scenario that shows the tick counter lagging with identical digests.
- `SubChunkRequest` can load an evicted chunk that was already announced (`PlayerSession.ts:578`). The read lane allows the wait, and slice 1 has to confirm the load reaches the world as an input.
- `World.replayStateDigest` calls `dataEntities().persist()` before it hashes, so taking a digest has a side effect. Slice 2 has to remove it or show it changes nothing.
- The replay test asserts only that one tick has a digest. Slice 1 should make it compare two runs tick by tick before anything depends on it.
- How the path finder treats a read from an unloaded chunk was not traced.
- Whether a saved player's inventory record is a deep copy was not confirmed. Slice 8 depends on it.
- Tick functions run from the ticker after the worlds, and a function can act in another dimension. Slice 9 treats a function as an input to the world it runs in and a cross-world command as a message. Confirm against Bedrock when a function runs relative to the tick.
- The handler lanes were assigned from each handler's direct calls and not from a full trace. Slice 1 reviews the 15 readers and the `Disconnect` handler one by one.
