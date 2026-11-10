# Can a player be a store entity? The A5 spike

Written 2026-11-10 for work package A5 of the [entity and tick re-architecture plan](../plans/entity-simulation-rearchitecture.md), against commit `348bfb5ac4`. Every count and line reference in this note is from that commit on that day. The spike code was thrown away. The commands at the end rebuild the counts, and the [prototype](#how-the-spike-was-built) section says what to write to repeat the spike.

## Verdict

Yes, with changes. A player fits the shape [ADR 0008](../adr/0008-one-entity-model.md) gives it, a resolved entity type with the component state of an `EntityInstance` and a body, but only once three things that are true of every mob today stop being true of a player. The shipped `minecraft:player` definition declares no health, the runtime simulates every body it holds, and the runtime removes an entity when it dies. Each needs a rule in Prismarine's host layer. None needs a change to `@jsprismarine/entities`.

One sentence of the ADR has the reference between entity and session the wrong way round. Nothing in the simulation needs to reach a session once replication reads the change log, and every packet a session receives has to reach the entity. The session should hold the entity's id, and the entity should hold nothing of the session. The [proposed wording](#what-adr-0008-would-have-to-say) is at the end of this section.

Of the 126 members of `Player` and `Human`, 75 become component state or a system over it, 12 become session state, 10 become services keyed by player identity, 4 become a respawn service, 17 are deleted and 8 do not fit without one of the three host rules above.

## What the spike built

The prototype lived in `packages/prismarine/src/entity/__spike__/` and ran as one Vitest file. It used the real runtime, the real content loaders and the real inventory and record code, and replaced only the network session.

1. The store was an `EntityRuntime` built by `entityFixture` from `src/entity/data/testing.ts`, with the body of the shipped `minecraft:player` file from `bedrock-samples` v1.26.50.4 added as an extra entity definition. Player components lived in a `Map` keyed by entity id beside it.
2. The player entity came from `runtime.spawn('minecraft:player', ...)`. Its components were a real `HumanInventory`, vitals (food, saturation, exhaustion, air, drowning ticks, fall distance), a game mode, abilities, a spawn point, the credits flag and a session id.
3. The session stand-in held the entity's id and an outbox, and nothing else.
4. The save built a `WorldPlayerData` from the store entity and the components, encoded it with `playerDataToNbt`, decoded it with `playerDataFromNbt`, and loaded it into a second store through `runtime.restore` with `dataEntityRecordOf` plus `restoreInventory`.
5. The fixture cow attacked the player through `runtime.attack`, and the player hit the cow through `runtime.hurt` with its own entity id as the source.

All five steps ran. These are the results, in the order the spike met them.

| Check | Result |
| --- | --- |
| The shipped player file resolves and spawns | Yes, with no report. Families `['player']`, a 0.6 by 1.8 box, 24 active components, attributes `attack_damage` and `movement` only |
| A cow hits a store player built from the shipped file | Nothing lands, and nothing is reported |
| The same, with a built-in `minecraft:health` of 20 | Health 20 to 18, and `hurtFeedback` fires once |
| The player hits the cow through `runtime.hurt` | Cow health 10 to 7 |
| The cow hits the player again after a switch to creative | Health 18 to 16 |
| A lethal hit on the player | The runtime removes the player with reason `death`, and the session's entity id no longer resolves |
| The runtime ticks a player placed five blocks up | Gravity drops it to the floor and a push moves it 0.54 blocks sideways |
| A player standing next to a cow for five ticks | The cow pushes it 0.29 blocks |
| Save and load through the player record codec | Inventory, hand slot, health, food, saturation, game mode, spawn point and credits flag come back. Exhaustion does not, because the record has no field for it |

## What broke or bent

### The shipped player definition has no health

The vanilla `entities/player.json` declares 24 components and no `minecraft:health`. Bedrock's engine gives a player its health in code. The runtime takes damage only from a `health` attribute, so `EntityRuntime.hurt` returns at `EntityRuntime.ts:1832` and the hit disappears without a report. `EntityInstance.damage` (`packages/entities/src/entityInstance.ts:497`) behaves the same way. Worse, `tickVoid` removes any entity without health that falls below the world, with reason `fell_out_of_world` (`EntityRuntime.ts:3673`), so a health-less player in the void would be deleted from the store.

Adding `minecraft:health` with a value of 20 through a built-in overlay fixed every damage check in the spike. That is the same treatment ADR 0008 already gives items and the eye of ender, which have no shipped file at all. The overlay should add only what the engine supplies in code and leave the 24 shipped components alone, so a pack that edits the player still wins.

The four `minecraft:player.*` components (`player.saturation` 5 of 20, `player.exhaustion` 0 of 20, `player.level`, `player.experience`) are parsed as data components with no behavior (`packages/entities/src/components/index.ts:185`). `Attributes` in the entities package accepts only the 11 names in `ATTRIBUTES` (`packages/entities/src/attributes.ts:11`), so hunger cannot be an `EntityInstance` attribute without widening that union. The spike kept vitals in a host component and read their starting values from these four components' parameters, which keeps the package unchanged.

Two places already treat the player as a type the runtime must not build. `serverSource.ts:122` refuses to spawn `minecraft:player` through the content seam, and the vanilla runtime test filters it out of the types it spawns (`vanillaEntityRuntime.test.ts:33`).

### The runtime simulates every body it holds

A player's position comes from its client (`Human.ts:46` explains why the server never moves one). `EntityRuntime.tickEntities` (`EntityRuntime.ts:1100`) runs `coast`, `step`, `updateGrounded` and `pushIntersectingEntity` on every entity in its map. In the spike that dropped a player five blocks and pushed it sideways. A live server would then send those positions back, and the client would rubber-band.

The store needs to know who owns a body's movement. A body the client drives gets its position, rotation and ground state from inputs, and the tick skips gravity, navigation and pushes for it. Pushes from a player onto mobs stay, as `Human.occupiesSpace` has them today. Knockback and impulses aimed at a client-driven body become occurrences that replication sends to that client, which is what `Player.applyKnockback` already does by sending motion (`Player.ts:1224`).

### Death removes the entity

`EntityRuntime.kill` drops loot and removes the entity (`EntityRuntime.ts:3110`). A Bedrock player stays in the world while its death screen is up, keeps its runtime id, and comes back through `RESPAWN`. The spike's session was left holding an id the store no longer had. A player's death has to commit a dead state and leave the entity in the store, and respawn has to clear that state. The shipped file's `minecraft:loot` is `loot_tables/empty.json`, so the loot half of `kill` is harmless for a player.

### Smaller bends

- The runtime does not read the game mode. The spike's creative player took a cow hit. The runtime filters creative and spectator players today only through `ContentEntity.creative` and `.spectator` on the host's player list (`EntityRuntime.ts:1955`), which a store player is not on. Game mode has to become a component the damage guard of [ADR 0013](../adr/0013-vetoable-actions-are-staged.md) reads.
- The runtime damage path has no grace period, armor, absorption, resistance or cancellable event. `Entity.damage` (`Entity.ts:828`) has all of them, and the two cow hits in a row both landed. Slice 4 already owns this, and it has to bring the armor read from the inventory component (`Human.ts:79`) with it.
- Player-only queries miss store players. `entitySensorCandidates` (`EntityRuntime.ts:1982`) and the anger broadcast read players from `host.players()`, and a store player is found only through the grid. Every `host.players()` and `host.playerById` read in the runtime has to read the one index instead.
- The record stores the eye position. `World.savePlayerData` writes `player.getPosition()` (`World.ts:3881`), which is 1.62 above the feet (`Human.ts:17`). A store body stands at its feet. The spike wrote feet into the record, so a legacy reader would have put the player 1.62 blocks into the floor. The save and load code has to convert at the record edge, or the record format changes.
- Component state that the entities package keeps outside `EntityInstance` is invisible to the store. `minecraft:breathable` keeps each entity's air in a `WeakMap` inside the component factory (`packages/entities/src/components/hazards.ts:241`). There are 18 such maps in 7 component files. The store cannot log, save or digest them. This hits mobs at slice 2 as much as players, and it matters for players because breath would then be either this hidden state or the player's own `drowningTicks`, not both.
- `Player.consuming` holds a closure (`Player.ts:1472`). A closure cannot be saved, logged or replayed. It has to become data, such as the item and the tick the meal ends on, with the effect resolved when the meal finishes.
- Seven pieces of player state live in maps keyed by the `Player` object, outside the class: advancements (`advancement/progress.ts:23`), the enchantment seed (`enchantment/enchantingTable.ts:45`), filter views (`entity/data/live.ts:70`), boss bars (`network/BossBar.ts:13` and `:45`), the eye of ender cooldown (`network/handler/InventoryTransactionHandler.ts:61`) and per-player moves in the replicator (`network/NetworkWorldReplicator.ts:839`). Each has to be keyed by identity or entity id before `Player` can go.

## The member mapping

`Player` declares 114 members (`Player.ts`) and `Human` declares 12 (`Human.ts`). Members inherited from `Entity` are counted where `Player` or `Human` overrides them, and not otherwise.

| Column | Count | Members |
| --- | ---: | --- |
| Becomes a component, or a system over one | 75 | Identity: `uuid`, `getUUID`, `xuid`, `getXUID`, `getName`, `randomId`, `skin`, `device`, `platformChatId`. Game mode: `gamemode`, `setGamemode`, `isVulnerable`, `isReachedEvenWhenInvulnerable`, `consumesFood`. Abilities and movement flags: `flying`, `isFlying`, `setFlying`, `sneaking`, `isSneaking`, `setSneaking`, `setSprinting`, `sleeping`, `isSleeping`, `setSleeping`, `onGround`, `isOnGround`, `setOnGround`. Vitals: `drowningTicks`, `updateVitals`, `updateBreath`, `isHeadInWater`, `updateHunger`, `applyStatusEffectTick`, `getFood`, `setFood`, `getSaturation`, `setSaturation`, `addFood`, `addExhaustion`, `addMovementExhaustion`, `addJumpExhaustion`, `fallDistance`, `getFallDistance`, `trackFall`, `land`, `isStandingInSomethingSoft`, `getDefaultAttributes`. Damage: `damage`, `applyKnockback`, `applyImpulse`. Portals: `getPortalTransitionTicks`, `getDefaultPortalCooldown`, `processPortalCooldown`. Mining and item use: `mining`, `getMining`, `setMining`, `stopMining`, `cancelConsuming`, `itemUseStartedAt`, `beginItemUse`, `takeItemUseTicks`. Respawn and credits: `spawnPoint`, `getSpawnPoint`, `setSpawnPoint`, `seenCredits`, `hasSeenCredits`, `setSeenCredits`. Inventory: `inventory`, `getInventory`, `craftingInput`, `getCraftingInput`, `getArmorDefensePoints`, `getArmorToughness`, `getEquipment`. Session link: `networkSession`, which the [direction section](#where-session-and-entity-reach-each-other) moves to the session |
| Becomes session state | 12 | `address`, `getAddress`, `connected`, `isOnline`, `locale`, `viewDistance`, `joinSpawn`, `getJoinSpawn`, `sendInitialSpawnChunks`, `kick`, `completeSpawn`, `getEyeHeight` (the 1.62 offset between what the client reports and the body) |
| Becomes a service keyed by identity | 10 | Permissions: `permissions`, `getPermissions`, `isOp`. Chat: `boundChatHandler`, `chatHandler`, `sendMessage`, `getFormattedUsername`. Persistence: `enable`, `restoreCarriedState`, `disable` |
| Becomes a world service | 4 | `setWorld`, `getRespawnPoint`, `resolveOwnSpawn`, `resolveSpawnIn`. The respawn search builds and reads other dimensions (`Player.ts:1098`), so it belongs to the level and answers with a destination, and a respawn into another dimension is a transfer under [ADR 0011](../adr/0011-a-world-exchanges-only-plain-data.md) |
| Deleted | 17 | `constructor`, `attachNetworkSession`, `getNetworkSession`, `timer`, `update` (split into the systems above), `sentAir`, `sentBreathing`, `syncBreath` (replication's job under [ADR 0016](../adr/0016-replication-reads-the-change-log.md)), `sendSettings`, `spawnTo`, `despawnFrom` (replication from the replica), `getTrackingRange`, `getTrackingInterval`, `broadcastsOwnMovement` (replication settings by type), `updateVoid` (the runtime's `tickVoid` covers it once a player has health), `MOB_ID`, `getFeetY` |
| Does not fit without a host rule | 8 | `onDeath` and `respawn` (death removes the entity), `setPosition` and `setPlayerPosition` (the runtime moves bodies the client owns), `occupiesSpace` (the runtime pushes players), `consuming`, `beginConsuming` and `tickConsuming` (a closure as state) |

Three columns hide more work than their counts suggest. `damage` lands in the component column, but its pipeline is slice 4's. `update` is one deleted member and turns into five systems. `getNetworkSession` is one deleted member with 104 call sites in 24 files.

## Where session and entity reach each other

[ADR 0008](../adr/0008-one-entity-model.md) lets the entity reference the session and forbids the reverse. The code needs the opposite, and only by id.

### From the entity to the session

`Player` and its callers reach the session through `getNetworkSession()` on 104 lines in 24 files. On 88 of them the method called is on the same line, and those group by what the call does:

| Use | Calls | How it is served without the reference |
| --- | ---: | --- |
| Sending a packet: `send`, `sendInventory`, `sendMetadata`, `sendAttributes`, `syncAttributes`, `sendAbilities`, `sendGamemode`, `sendGameTypeFor`, `sendMotion`, `sendMove`, `sendMessage`, `sendRespawn`, `sendRespawned`, `sendTime`, `sendStatusEffect(s)`, `sendSpawn`, `sendDespawn`, `sendSettings` and the rest | 59 | Replication. The change is a log entry, and replication maps entity id to session through a session registry outside the world |
| Raw connection access: `getConnection` | 10 | The `DeathInfo` packet and kicks. Death info becomes an occurrence in the log, and a kick is a session operation the server calls with the identity |
| Chunk streaming: `update`, `queueChunks`, `sendNetworkChunkPublisher` | 3 | The session reads the player's position from the replica. `Player.update` calling `PlayerSession.update` from inside the entity tick (`Player.ts:566`) goes away |
| Tracking: `tracks`, `considerEntity`, `dropEntity`, `reconcileTrackedEntities` | 8 | Replication's audience computation |
| Dimension change: `changeWorld`, `pendingDimensionChange`, `startCredits`, `releaseChangeHeldOverDeath` | 7 | A transfer message under ADR 0011. The one read in the simulation, `processPortalCooldown` waiting for the loading screen (`Player.ts:1283`), becomes a component flag that an input sets when the client reports the screen closed |
| Window state: `getOpenBlockContainer` | 1 | Session state, read by the handler that owns it |

None of these needs the entity to hold a session object or a session id. The entity holds the player's identity, and a registry keyed by entity id or identity finds the session.

### From the session to the entity

`PlayerSession` holds the `Player` object (`PlayerSession.ts:265`) and reads 22 of its members 70 times, mostly the runtime id, view distance, position, name, UUID, world, inventory and attributes. Packet handlers reach the player through `getPlayer()` 88 times in 79 files.

| Use | How it is served |
| --- | --- |
| A handler applying a packet to the player | An input addressed to the entity id, applied in the input step ([ADR 0009](../adr/0009-external-inputs-enter-once-per-tick.md)). The session must know the id to address it |
| Chunk streaming and tracking reading position, view distance and world | Position from the replica, view distance as session state, world as the session's own record of where it is attached |
| Join packets reading identity, skin, device, game mode and attributes | The membership entry for the player carries them ([ADR 0016](../adr/0016-replication-reads-the-change-log.md)) |
| Read-lane handlers replying only to the sender | The replica, as the plan already says for the read lane |

The session cannot work without its entity's id. The entity works without any reference to the session.

### What ADR 0008 would have to say

The sentence to change, in the second paragraph:

> Its network session is a separate object that the entity references, and the session does not reference the entity in return.

Proposed:

> Its network session is a separate object outside the world. The session holds its entity's id, and the entity holds no reference to the session. Packets reach the entity as inputs addressed to that id, and the entity's changes reach the session through replication, which finds a player's session by entity id.

Two smaller edits follow from the spike. In the first paragraph, after the sentence about items and the eye of ender, add that the player gets a built-in overlay for the parts of its definition Bedrock keeps in code, starting with `minecraft:health`. In the second paragraph, "respawn search becomes a world service" would read "respawn search becomes a level service, and a respawn into another dimension is a transfer between worlds".

## What `@jsprismarine/entities` would have to change

Nothing, for the shape to hold. The package already parses the shipped player file, resolves its components and runs its events, and the spike changed nothing in it. Health comes from a host overlay, vitals live in a host component, and the client-owned body is a host rule. The package's promise that it knows nothing about a server survives.

Two changes are worth making anyway, for reasons that are not specific to players:

- The 18 component-local `WeakMap`s in 7 files hold entity state the store cannot see. The change log of [ADR 0012](../adr/0012-the-change-log-is-the-history.md) requires every mutation to go through a setter, and these maps break that for mobs from slice 2. Moving that state onto the instance, in a slot the host can read and write, is a package change and belongs to C1, not to slice 5.
- Widening `AttributeName` to the player attributes would let hunger and experience live on the instance. The spike found no reason to do it, because no data-driven behavior reads those values.

## What the slice 2 adapter must provide

While players stay legacy and mobs and items move, the store has to treat a legacy `Player` as an entity it does not own. The runtime's `EntityHostFacts` (`src/entity/data/host.ts`) is most of that seam already. The adapter must:

1. Draw store ids and legacy runtime ids from one counter, so a goal's target id means one thing. `EntityRuntimeOptions.nextId` exists for this.
2. Put legacy players into the one index of [ADR 0007](../adr/0007-one-entity-index-visible-on-write.md), at their feet, with identifier, families, tags, game mode and a filter view, and refile a player in the same tick a handler moves it. The runtime's per-tick player snapshot and its invalidation after host effects (`EntityRuntime.ts:489`) are the current form of this and have to survive.
3. Route damage, projectile hits, knockback, sonic booms, status effects and hurt feedback to a legacy player by id, as `host.hurt` and its siblings do now.
4. Resolve identity to id and back (`playerIdentityOf`, `playerIdForIdentity`), so leashes, owners and cured-villager discounts that name a player keep working.
5. Expose a legacy player's equipment and armor to filters and to the damage compute step.
6. Write a change log entry when a legacy player's position, health, game mode or inventory changes, or the replay digest stops covering players for four slices. If that is too much for the adapter, the plan should say that digests exclude legacy players from slice 2 to slice 5.
7. Show store entities to legacy sessions. The mirror does this today. Slice 4 deletes the mirror, so from slice 4 to slice 5 something else must encode store mobs for the legacy `EntityTracker`.

## A breakdown of slice 5

The plan has slice 5 as one package, C4. It splits into these, each in its own worktree.

| Package | Work | Depends on |
| --- | --- | --- |
| C4a | Re-key the seven `Player`-keyed maps by identity or entity id. Needs no store and can run beside B3 | none |
| C4b | The player overlay definition (health, and anything else Bedrock keeps in code), a client-owned body rule in the runtime tick, and a death that keeps the entity with a respawn that revives it | C1, C3 |
| C4c | Player components with logged setters: identity, game mode, abilities, vitals, mining, item use, consumption as data, spawn point and credits, and the inventory with one field entry per slot | C1 |
| C4d | Player systems: hunger and regeneration, breath (one owner, either the `breathable` component or the vitals component), fall damage, consumption and mining cracks, all reading loaded chunks only | C4b, C4c |
| C4e | Persistence on the store: `WorldPlayerData` from the entity and its components, the eye-height conversion, and the data-entity record for component groups and properties such as the raid omen. Plugs into B3's service | C4c, B3 |
| C4f | The session holds the entity id. Convert the 79 source files that name `Player`, split by directory: `network` (24), `entity` (11), `events` (10), `world` (8), `advancement` (5) and the rest. Each group can run beside the others once C4c lands | C4c |
| C4g | Show store players to clients until slice 7: player list, `AddPlayer`, abilities and metadata from the store entity through the current replicator | C4b, C4c |
| C4h | Convert the 117 test files that name `Player`, then delete `Entity`, `GenericEntity`, `Human`, `Player` and the adapter | all of the above |

C4a starts at once. C4b and C4c run side by side after C1. C4d, C4e, C4f and C4g run side by side after C4c. C4h is last.

## Risks, most likely to stall the slice first

1. The 79 source files and 117 test files that name `Player`. Most changes are mechanical, but each group of handlers is also where the session-to-entity direction is decided, and a group that slips holds C4h. Splitting C4f and C4h by directory is what keeps this from being one serial job.
2. Client-owned movement inside a simulated store. Fall damage, the void, portals, pushes and knockback all assume either the client or the server moves the body. Getting one of them wrong shows up as rubber-banding in a client e2e scenario, not as a failed unit test.
3. Death and respawn across dimensions. Respawn search reads other dimensions and may build one (`Player.ts:1098`), and the slice 4 world service has to cover a bed in another dimension before slice 5 can delete `getRespawnPoint`.
4. Change log completeness for inventories. A slot change today mutates an `Item` in place, and `HumanInventory.assignStackNetworkId` writes a protocol id onto the item. Stack network ids and the cursor are session state, and pulling them out of the inventory is a change to every inventory transaction handler.
5. Component state the store cannot see, the 18 `WeakMap`s. If C1 does not move it onto the instance, a player's air and lava damage timers are missing from saves and digests.
6. Record compatibility. The eye-height offset and the exhaustion field the record lacks are both easy to miss, and a mistake moves or changes every returning player.

## Found on the way

Nothing reads the `keepInventory` game rule (`world/GameRuleManager.ts:30` registers it), and `Player.onDeath` drops nothing, so a player never drops its inventory on death. This is outside A5's scope. The package brief rules out opening issues, so it is recorded here for the program owner.

## How the spike was built

To repeat it, write a Vitest file under `packages/prismarine/src/entity/` that:

1. Reads `behavior_pack/entities/player.json` from the `bedrock-samples` cache under `node_modules/.cache/jsprismarine/`.
2. Calls `entityFixture(new TestEntityWorld(), {}, { 'minecraft:player': { description, components, component_groups, events } })`, once with the shipped components and once with `minecraft:health` set to `{ value: 20, max: 20 }` added.
3. Spawns the player and a cow, calls `runtime.attack(cow.body, runtime.mobById(player.id))` and `runtime.hurt(cow, player.id, 'entity_attack', 3)`, and reads `instance.attributes.get('health')`.
4. Spawns a player five blocks above the floor, ticks the runtime 20 times, and reads its position.
5. Builds a `WorldPlayerData` from the entity and its components, round-trips it through `playerDataToNbt` and `playerDataFromNbt`, and restores it into a second fixture with `runtime.restore(dataEntityRecordOf(player), ...)` and `restoreInventory`.

Run it with `pnpm exec vitest run <path>` from `packages/prismarine`.

The counts in this note come from these commands, run from the repository root:

```sh
# Members of Player and Human
grep -cE "^    (public|private|protected)( static| readonly| override| async)* [a-zA-Z_]+" \
  packages/prismarine/src/Player.ts packages/prismarine/src/entity/Human.ts

# Entity-to-session calls, and the files they are in
git grep -c 'getNetworkSession()' -- packages/prismarine/src ':!*.test.ts'

# Session-to-player reads in PlayerSession, and getPlayer() calls
grep -oE "this\.player\.[a-zA-Z]+" packages/prismarine/src/network/PlayerSession.ts | sort | uniq -c
git grep -c 'getPlayer()' -- packages/prismarine/src ':!*.test.ts'

# Files that name Player
git grep -lE "\bPlayer\b" -- packages/prismarine/src ':!*.test.ts' | wc -l
git grep -lE "\bPlayer\b" -- 'packages/prismarine/src/**/*.test.ts' | wc -l

# Maps keyed by the Player object
git grep -nE "(Weak)?(Map|Set)<Player\b" -- 'packages/prismarine/src/**/*.ts' ':!*.test.ts'

# Component state outside EntityInstance
git grep -c 'new WeakMap<EntityInstance' -- packages/entities/src ':!*.test.ts'
```
