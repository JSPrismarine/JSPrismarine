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
| B3b chat fan-out and respawn search as services | Done on `refactor/chat-fanout-respawn-service-v2`, not yet integrated |
| B4 save pass measurement, B5 re-keyed maps | Landed |
| C1a component state on the instance, C1b one entity index, C1c the entity store with logged setters, spans and undo | Landed |
| Replay determinism fixes (settle gaps, wall-clock chunk budget in the harness) | Landed |
| C2 items and the eye of ender in the store | Done on `refactor/item-entities-to-store-v2`, not integrated |
| C3 staged damage and death, the mirror deleted | Done on `refactor/store-owned-mob-damage-v3`, not integrated. Damage, death and client display are the store's; the legacy bodies remained for non-network callers until C3b |
| C3b the legacy mob bodies deleted, which meets slice 4's "no mirror class" target | Done on `refactor/delete-legacy-mob-bodies`, not integrated, see below |
| C4c player components with logged setters, and an inventory that logs one entry per slot | Done on `refactor/player-components-logged`, not integrated |
| C4b the player overlay, client-owned movement and a death that keeps the entity | Done on `refactor/player-overlay`, not integrated. The store's rules are ready for a store player; the live player is still legacy, see below |
| C4e player persistence from the store entity, the saved record unchanged | Done on `refactor/player-persistence-from-store`, not integrated, see below |
| C4d, C4f to C4h and everything in phases D to F | Not started |

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
- A player's inventory was not logged: a slot changed by mutating the `Item` in place and `Inventory` did not know its owner. C4c closed this, as the notes below say. Legacy position, health and game mode are logged through `entity/legacyAdapter.ts`.
- A merchant's offers are saved and hashed but not logged, because a trade changes the `Merchant` in place.
- An undo restores only what a save or the digest reads. Goal progress, pending deaths and other runtime bookkeeping stay as the throw left them.
- A chunk admitted inline inside a unit pins the unit, which then keeps its writes if it throws, until slices 3 to 9 remove the inline loads.
- Writes between ticks, such as tick functions, which run after the worlds seal, and connection-lane handlers, are counted as unlogged and not logged.
- A player whose update throws is not contained yet: legacy updates do not run as units. When players move into the store, the store's failure count disconnects the session instead of removing the entity.

B3b left these for C3 and C4.

- Chat fan-out is `ChatManager`. A player joins it as a `ChatRecipient`, keyed by `keyOfPlayer`, with a `receive` callback, and the manager decides the audience and builds the line. Each recipient is still its own `chat` listener, because a listener that cancels the event stops only the players who joined after it. One listener with one audience pass is the shape D4 wants, and it changes which players such a listener stops, so it belongs with the guards of ADR 0013 or the event bus of slice 10.
- Respawn search is `RespawnSearch` in `world/RespawnSearch.ts`, one for each level (`Level.getRespawnSearch`). `find(request)` takes the player's key, saved spawn point and body as plain data. It answers with `spawn` (`own` or `world`), the dimension, the three exchange positions and `spawnPointLost`, and writes nothing. Every world read is behind its `RespawnWorlds` port: building the bed's dimension, the bed and feet checks, and the world spawn, which can still run the search for dry land.
- `Player.getRespawnPoint` is the adapter. It builds the request, applies `spawnPointLost` by clearing the point and sending `tile.bed.notValid`, and resolves the answer's world. `onDeath`, `respawn`, `RespawnHandler` and `DimensionTravel.leaveEnd` call it. For C3, `onDeath` sends the request instead of awaiting the adapter, and the input that admits the answer applies `spawnPointLost` and sends the `SearchingForSpawn`. The in-tick chunk load entry for the search names `RespawnSearch.ts` and slice 4.
- The request does not carry the world spawn. Reading it before the search would run the search for dry land even when the player's own point holds, so the service reads it only when it falls back to it.
- For C4, the request's spawn point comes from the store entity's component, and the chat recipient's `receive` finds the session through the session registry by identity.

C2 left these for later packages.

- Dropped stacks reach clients through `entity/data/itemBodies.ts`, an `ItemActorBody` per stack that reads the store entity and goes on the wire as an `AddItemActor`. It sits apart from the mirror, so whatever replaces the mirror for the legacy tracker can take it over too. The eye of ender has no display code of its own and shows through the mirror like any store mob.
- The item bodies still run `Entity.update`, which is how a stack reaches a portal. Portal travel adopts a stack that arrives in another world into that world's store from the body's saved form. Slice 9 turns travel into messages and removes this.
- A stack's age is component state, so each stack appends one component entry every tick it lies in a ticking chunk, besides its position and speed while it moves. An idle world with stacks on the ground is not an idle log.
- The eye's shatter roll draws on the dimension's random, where the legacy eye drew on the server's.
- A drop now goes straight into the store, so it no longer waits on `World.addEntity`. `World.ITEM_ENTITY_LIMIT` counts the item bodies.

C4c left these for later packages.

- Every write to a slot of a player's main inventory, armor, off hand, ender chest, cursor or crafting grid appends one `inventory-slot` entry. Its value is the stack's saved form (`inventory/slotLog.ts`), the same form the player record keeps, so an undo restores what a save and the digest read. The hand slot is the entity field `inventory.handSlot`. `Inventory.observe`, `HumanInventory.observeCarried` and `CraftingInput.observe` report the writes, and `Human` wires them to the adapter.
- `PlayerComponents` (`entity/playerComponents.ts`) holds vitals (food, saturation, exhaustion, drowning ticks, fall distance), experience, flying, the movement flags (sneaking, sleeping, on the ground), the spawn point, the credits flag and the tick an item use began. Each field is logged as `<component>.<field>`. Food, saturation, exhaustion and experience stay in the attributes and the component reads them there. `Player`'s private fields are accessors over it, so the death, respawn and damage paths were not edited and are logged too. C4e and C4f can move this object onto the store entity unchanged.
- The replay digest hashes `Player.componentSnapshot`, so digests of a world with a player changed once, in a commit of their own. The replay suite still finds two replays identical.
- Not logged yet, for C4d: air (`metadata.air`, whose owner C4d decides), sprinting, the block being mined, the meal in progress, which still holds a closure, and every attribute other than the ones above, such as movement speed and luck. Absorption is on the damage path, which C3 owns.
- A stack changed in place is not a write. The inventory keeps each slot's last logged value, so the next write to that slot still carries the right before-value, but the change lands in the tick of that write. Two paths did this and were converted: wearing a tool, now `Item.withDurability`, and a partial `/clear`. `ItemStackRequestHandler.itemOrNull` still sets an item's count from its entry in place, which changes no saved form. A slot whose entry count and item count disagree logs the entry's count only.
- A stack network id is session state and is not in a slot's value, so an undone write gives the stack a new id. Replication has to send the slot again (slice 7).
- A workstation's input slots and a chest's slots are block entity state, which D3 logs.
- `Entity.restoreLoggedField` and `restoreLoggedSlot`, which `Human` and `Player` override, are how the adapter's inverse writer reaches a legacy player. C4h deletes them with the adapter. Test doubles built from `Player.prototype` without the constructor get their components from `withPlayerComponents` in `testing/playerDouble.test.helper.ts`, which C4h deletes with them.
- `Player.getExperience` replaced six hand-built experience holders, so every experience write goes through the component.
- The saved player record is unchanged: `PlayerPersistenceFormat.test.ts` passes byte for byte.

C3 left these for later packages.

- Every blow a store entity takes is a `DamageIntent` run by `DamagePipeline` (`entity/data/damagePipeline.ts`, `damageStages.ts`): a mob's bite, an area attack, a projectile, a blast, a player's swing, a status effect, a command, an item action, a component hazard and a dropped stack's fire, lava and cactus. The guards are `present`, `invulnerable`, `damage_resistant` (a dropped stack's item), `hit_grace`, `cannot_be_attacked`, `dragon`, `damage_sensor`, the `fireDamage` game rule and the before-hooks a host adds. The modifiers are the grace difference, armor, protection, resistance, absorption, the dragon's scaling and the sensor's multiplier, in that priority order, so the sensor still scales what armor left, as it did when the mirror handed the runtime the body's loss.
- A blow from the legacy code keeps the rules the legacy pipeline gave a mob through `DamageSourceFacts`: the grace period, the mitigation and the shove. A mob's own attacks keep none. `legacyDamage.ts` turns a `DamageSource` into an intent and maps the legacy causes to Bedrock names, so a sensor sees a player's swing as `entity_attack`.
- A veto appends one `action-rejected` occurrence and nothing else. The grace period is a runtime map, not logged and not saved, as the legacy body's was not. The sensing is memoized for one run in `DamageSensingSlot`, which the sensor guard, the multiplier and the commit share.
- A death runs inside the commit of the blow, queued `minecraft:on_death` events first, where it waited for the entity's next tick before.
- The plugin `entityDamage` event is a before-hook that can cancel a blow or change its amount, and `entityDeath` and the advancement triggers are raised from `EntityHostFacts.damageCommitted`, inside the blow, before a death removes the victim. The `gameplay.combat-advancements` parity family checks that timing. Slice 7 has to keep it when observers read the log.
- Health is the store's alone. The comparison that handed a body's loss back to the runtime is gone, and a body reads its health from the store and heals through it.
- Clients are shown store entities through `StoreActor`s (`entity/data/storeActors.ts`), one per store entity, which answer the network layer from store state through the structural `ShownActor` (`world/ShownActor.ts`). `StoreActors.sync` sends what changed since it last sent each entity, which is replication's work until slice 7 reads the log instead. Nothing in it is mob-specific; the eye of ender shows through it. Dropped stacks still show through C2's `ItemActorBody`, which the actors can take over.
- The legacy bodies (`LiveBodies`) stayed in each world's entity map, written silently and never announced, because the legacy code still reached a mob through them: commands and selectors, legacy blasts and swings (`damageEntity`), interactions and trades, chunk saves and the replay digest (body NBT and attributes), portal travel, spawner counts, the dragon fight and riding. C3b moved those to the store actors and deleted the bodies.
- `damage` is synchronous for store entities. A legacy player's `Entity.damage` is still async, because its sends are awaited, and `live.ts` still starts it without awaiting for a mob's blow on a player. That goes with C4b and slice 7.
- A player's death no longer awaits the respawn search. `onDeath` files it with `RespawnRequests` (`world/RespawnRequests.ts`), and the next input step awaits every search filed before it, in order, then applies `spawnPointLost` and sends `Respawn` and `DeathInfo`. Awaiting in the input step keeps the applying tick independent of host speed, but the search still loads chunks inside the tick, so its `IN_TICK_CHUNK_LOADS` entry moved to slice 9, where such loads become recorded inputs. `RespawnHandler` and `respawn` still search as they run.

C3b, which deleted the legacy mob bodies, left these for later packages.

- Every store entity but a dropped stack reaches the legacy world code through its `StoreActor` (`entity/data/storeActors.ts`), the same object that shows it to clients. `World.getActors` and `World.getActor` list and find a world's entities, a store entity as its actor; `World.getEntities` and `World.getEntity` hold only legacy entities, which are players and the bodies of dropped stacks. `WorldActor` (`world/WorldActor.ts`) is the union of the two, and it is what `DamageSource`'s attacker and projectile, the `entityDamage`, `entityDeath` and `entityPortalEnter` plugin events, the advancement triggers, the death messages, the trade window, the save context and the providers take. Slice 5 narrows it to the actor.
- The actor answers from the store and keeps no copy of it. A blow on it runs `DamagePipeline`, a shove and a teleport write the body, and a tag or a status effect goes into the entity's state, filtered by its `minecraft:mob_effect_immunity`. It keeps three things the store does not model yet: the actor record tags a save carries forward (`persistentNbt`, which a save writes the record into), the portal cooldown and contact, and the clock of the status effects. Slice 9's travel as messages takes the portal state; the other two belong with replication's replica (slice 7) or with a status effect component.
- The world updates each actor in its tick, after the legacy entities, which runs the portal clock, a trip once its contact is ready, and the status effects, whose harm and healing go through the store. The bodies did this in `Entity.update`, interleaved with the legacy entities in the order the entity map held them. `DimensionTravel` moves a store entity by restoring its record in the destination store, with its actor record tags, tags and status effects.
- Chunk membership of a store entity is the index. Its cells are sixteen blocks wide and aligned to chunks, so `EntityIndex.chunkChanged` reports the chunk each move is in and the chunk a crossing left, and the world marks them for the next save, as the body's position writes did. A chunk that leaves the world takes the store entities `EntityIndex.storeInChunk` files in it. C1b's two structures no longer disagree, and a legacy blast no longer searches four blocks past its reach: it asks for the legacy entities (`legacyWithin`) and the store's (`storeWithin`) apart.
- The replay digests did not change: an actor carries the tags, attributes and metadata the body carried, and the digest hashes the actors in the order it hashed the bodies.
- The in-tick copy of `EntityRuntime.all()` for the mirror's `sync` is gone, and spawner caps walk the entity map and the actors in place. `World.getActors` copies and sorts for selectors, saves, the digest and the content adapter's `at`, `near` and `countOfType`, which slice 5's target removes. No `IN_TICK_CHUNK_LOADS` entry went through a body, so the list is unchanged.
- The proxy target "no mirror class and no health comparison" gates now. `entity/data/noMirror.test.ts` fails if `liveBodies.ts` returns or another legacy class wraps a store entity, and `live.test.ts` checks a running world: a store entity shows through its actor with nothing in the entity map, and a health written onto an actor is not handed back to the store.
- C2's `ItemActorBody` stays. A dropped stack still reaches a portal through `Entity.update`, goes on the wire as an `AddItemActor`, and merges, is picked up and is unloaded as a legacy body, so folding it into the actor means moving all four paths, which is not small. Slice 9's travel as messages removes the first and makes the rest a display question.
- `/summon` has no command form that passes a name: only the command host's `entities.summon` does, and it now names the entity in the store, where the body's name had reached no client since C3.
- In-game checks for the orchestrator's combined pass: name a mob with a name tag, lead it, ride a saddled pig or a horse, trade with a villager, and walk a mob through a nether portal, then save, restart and find each where it was.

C4b left these for later packages.

- The player overlay is code, not a pack file: `entity/playerOverlay.ts`, applied in `buildServerContent` to whichever pack's `minecraft:player` file won the stack. A file under `vanilla_overlay/entities/` would replace the shipped player file whole, where the overlay adds a component only when that file declares none. It adds `minecraft:health` 20 of 20 and nothing else. The raw definitions in `ServerContent.definitions` still hold the file as it shipped; the resolved type carries the overlay. The `entities.behavior` parity family checks it as `player-health`.
- The store's three player rules key on `clientOwnsMovement(identifier)`, which is true of `minecraft:player` alone. A player's update in the entity pass stops after its timers, its components and the void check, so it gets no brain, navigation, coast, step or pushes, and `isPushable` is false for it while it still pushes mobs. `MobBody.onImpulse` turns every `push` on a player's body, a blow's shove included, into an `impulse` occurrence and leaves its velocity alone. `EntityRuntime.applyClientMovement` writes what the client reported, and `MobBody.teleportTo` stays the server's move. `kill` keeps a player: it stays in the store and in `dying`, so the `present` guard vetoes further blows, until `EntityRuntime.revive` brings it back at full health with one health entry and no membership entry. No live player is a store entity yet, so these rules run only in `entity/playerOverlay.test.ts`. The package that spawns one (C4e, C4g or C4h) also has to keep it out of chunk saves, which skip only the legacy class today (`ChunkSaveContext.ts`), and out of the despawn cycle.
- For the live player, every server move is acknowledged. `Player.setPosition` always sends a teleport, where it sent a `Normal` move that registered nothing, which chorus fruit used. A move event's reset (`PositionMode.Respawn`) registers the same acknowledgment a teleport does. A join, a respawn and a world change move the player without a `MovePlayer` because their own exchanges place the client. Every handler whose source moves a player is in the input lane, and `Lane.test.ts` checks that.
- A shove on a live player is logged as an `impulse` occurrence beside the motion `PlayerSession.sendMotion` still sends, until slice 7 sends it from the log.
- A live player's death keeps its runtime id, as the legacy class always did, and appends no membership entry. `respawn()`'s attribute reset is now logged: health, and the component fields the attributes hold, through `PlayerComponents.reportingChanges`. A respawn into another dimension moves the player between worlds, which is a transfer under ADR 0011 and keeps the id; once players are store entities that is a leave from one store and an enter into another.
- A blow on a live player commits before it waits. `Entity.damage` starts its packets instead of awaiting each, and `Player.onDeath` posts `entityDeath`, raises its advancement triggers and files the respawn search before its first wait, so the health, the grace period, the death and the request are written when the call returns. What remains: the blow still runs the legacy rules in `Entity.damage`, not `DamagePipeline`, so a plugin's `entityDamage` handler and the grace period differ by path; the promise still covers the packets, which `live.ts` starts without awaiting; and `applySonicBoom` waits for that promise to learn whether the blow landed before it shoves. Running a player's blows through `DamagePipeline` needs the player to be a store entity, which is C4h's.
- No client e2e scenario covers riding, because `/ride` is unsupported (`command/host/entities.ts`); a player riding a mob is checked in game. The new `player-knockback` scenario covers a mob's shove on a player.
- Found on the way: chorus fruit puts a player's eyes where their feet belong (#2961). Run alone after `fall-damage` and `damage`, the `dimensions` scenario fails on the health those left, because nothing heals between scenarios. It passes alone, and CI's full suite has passed with it.

C4e left these for later packages.

- The record is a projection with one home, `world/playerRecord.ts`. `playerRecordFrom(player, services, dimension)` builds it and `applyPlayerRecord(player, data, defaultGamemode, content)` puts one back, through two structural ports, `PlayerRecordSource` and `PlayerRecordTarget`. `recordedPosition` reads where a record puts a returning player. `PlayerPersistence` still owns where a record is read and written and the key it is filed under (`keyOfPlayer`).
- A live `Player` satisfies both ports. `World.savePlayerData` calls `playerRecordOf`, which reads the advancements and the enchantment seed from their keyed services and calls `playerRecordFrom`, and `Player.enable` calls `applyPlayerRecord` and `recordedPosition`. `Player.restoreHealth` and `Player.restoreFlying` are the two silent writes the load needs. Live behavior did not change, and `PlayerPersistenceFormat.test.ts` still passes byte for byte.
- A store player is `StorePlayer` (`entity/storePlayer.ts`): the `minecraft:player` store entity, which holds the position, the look and the health, and beside it the parts the store does not model yet, in the objects a live player holds them in: the client's attribute table, `PlayerComponents`, `HumanInventory`, the game mode, the portal cooldown, the head yaw and the identity. The record holds the eye, so `StorePlayer` adds `EYE_HEIGHT` to the entity's feet and `placeAt` takes it off. A y that is not exact in binary can move by its last bit across a save and a load. The record's attribute table takes its health entry from the entity's health and maximum, so a store player saves the table a live player saves. The format test builds a store player the way C4b's tests do, writes both fixtures byte for byte from it, loads each fixture into a fresh one and writes the same bytes again.
- What C4h has to switch on:
  1. Where store players live. Nothing builds a `StorePlayer` outside tests. C4h keeps one per player entity, keyed by entity id, builds it at login from the spawned `minecraft:player`, and applies the record before the entity enters the store, so the load appends no entries, as the live load runs before the world holds the player.
  2. Logging. A `StorePlayer`'s components and inventory log nothing, because `EntityRuntime.writeField` throws `LoggedFieldError` on a field it does not know, and an undo would then stop the world. C4h wires them to `EntityStore.written` and `writtenSlot` and adds an inverse writer for the player fields, which replaces the adapter's `restoreLoggedField` and `restoreLoggedSlot`.
  3. The keyed services. `storedAdvancements`, `loadAdvancements`, `forgetAdvancements`, `enchantmentSeedOf` and `forgetEnchantmentSeed` take a `Player` and use only its key and the server. They need a form that takes the key, and then `World.savePlayerData`, `World.getPlayerData` and `lastPlayerRecord`, which take a `Player` today, take the key and the store player.
  4. Copies to delete with `Player`. `StorePlayer.setSaturation` and `setPortalCooldown` repeat the clamps of `Player.setSaturation` and `Entity.setPortalCooldown`, and `EYE_HEIGHT` lives in `entity/Human.ts`, which C4h deletes.
  5. The maximum health in a record's table is not applied to a store entity, whose type decides it. Both are 20 today.
  6. The head yaw is kept on the `StorePlayer`, because `MobBody` has none and `EntityRuntime.applyClientMovement` takes only the yaw and the pitch.
  7. C4b's note still applies: a store player has to stay out of chunk saves (`ChunkSaveContext.ts`) and out of the despawn cycle.
- A saved player record is a deep copy, which closes the question under "Checks to run". Checked again at this package: `storedInventory` builds new arrays and builds each stack from primitives, the attribute table, the experience and the position are numbers, and the advancements' `toJSON` builds new objects. The one shared object was the spawn point, which was the component's own value. A write replaces it and never changes it in place, but `playerRecordFrom` now copies it, so a record held until a later commit under ADR 0018 shares nothing with the player. `inventory/persistence.test.ts` asserts it for the inventory, and the format test for a whole store player record.
- The client e2e `rejoin` scenario is new. It leaves the Nether hurt and logs back in, and checks the dimension, the position and the health. No scenario left and rejoined before. `dimensions`, `spawnpoint-respawn` and `death-respawn` pass with it.
- In-game checks for the orchestrator's combined pass: log out with a damaged, enchanted and renamed tool in the hand, armor on, a shield in the off hand and items in the ender chest, on part health and food, in the Nether, with a bed set in the Overworld, and log back in. Everything comes back, and dying sends the player to the bed.

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
- Whether a saved player's inventory record is a deep copy. Confirmed by B4 and again by C4e, which also made the record copy the spawn point; see the C4e notes.
- Tick functions run from the ticker after the worlds, and a function can act in another dimension. Slice 9 treats a function as an input to the world it runs in and a cross-world command as a message. Confirm against Bedrock when a function runs relative to the tick.
- The handler lanes were assigned from each handler's direct calls and not from a full trace. Slice 1 reviews the 15 readers and the `Disconnect` handler one by one.
