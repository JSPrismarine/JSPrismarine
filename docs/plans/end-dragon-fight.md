# The End dragon fight: the chunks

The specification is [docs/research/end-dragon-fight.md](../research/end-dragon-fight.md) ("the
fight note"); read it before any chunk, with the section numbers cited below. The target: a
player can reach the End, see the ten spike pillars with crystals and the dragon with its boss
bar, kill it (no flight AI needed; the placeholder goals that hold it in place are enough as long
as it is visible, damageable and killable), watch the exit portal open with the egg on the first
kill, enter the portal, see the credits, return to their spawn point, and respawn the dragon with
four crystals on the portal's edges. Gateway teleports are deferred (fight note section 10): the
blocks are placed, the teleport is a later slice.

Each chunk is sized for one agent, lands as one or a few Conventional Commits
(`type(scope): subject`, imperative, 72 characters), and leaves the tree typechecking and green.
Chunks in one wave touch disjoint packages or files; a chunk may start when its dependencies have
landed. Follow [commit discipline](../../.agents/skills/commit-discipline/SKILL.md), run
`pnpm run lint:custom` after the last edit of every chunk, and add a Changeset per published
package changed (every package here is below 1.0.0: breaking is `minor`, feature or fix is
`patch`).

The checks, as in [data-driven-dimensions.md](data-driven-dimensions.md): **package**
(`pnpm --filter <pkg> run test` and `typecheck`), **types** (`pnpm run typecheck`), **custom**
(`pnpm run lint:custom`), **corpus** (`pnpm --filter @jsprismarine/parity run test` then
`dashboard`). The Overworld corpus must stay byte-identical in every chunk; chunk 5 changes End
chunk contents on purpose, which no corpus pins today, and extends the `worldgen.dimensions`
parity test to pin the new End output instead.

## Open questions needing a real client

Record answers in `docs/data-driven/dimensions.md` (or the page chunk 9 adds) when found.

1. Does the retail client keep the boss bar when the dragon is outside its tracking range? The
   bar binds to a tracked actor and PowerNukkitX resorts to a dummy actor (fight note section 9).
   If the bar drops, follow the dummy-actor pattern in chunk 6.
2. Which Bedrock events render Java's level events 3001 (summon roar), 3000 (gateway spawn) and
   1028 (dragon death sound)? No verified mapping exists; chunk 7 and 8 ship candidates
   (`ActorEvent.DRAGON_START_DEATH_ANIM = 37`, `LevelEvent.PARTICLES_EXPLOSION = 2025`,
   `LevelSoundEvent.EXPLODE = 48`, the `mob.enderdragon.*` sound names) and a run against a
   retail client decides.
3. Does the client draw the crystal beam from `BLOCK_TARGET` actor data alone? The vanilla
   render controller suggests yes (fight note section 9); verify with a retail client.
4. Does the retail client accept `ChangeDimension` while the credits screen is up, or must the
   server hold the transfer until the serverbound `EndCredits` reply? Chunk 4 holds the transfer
   as the safe default, matching Java's `PERFORM_RESPAWN` exchange.
5. Bedrock's egg-on-second-kill quirk (MCPE-51345) and its podium self-repair are wiki claims.
   This plan follows Java (first kill only, no self-repair); revisit only if a retail client
   comparison shows players expect the quirk.

---

## Wave 0: four independent foundations

### Chunk 1: seed-derived spikes and crystal options in `@jsprismarine/features`

**Goal.** Java's `EndSpikeFeature.getSpikesForLevel` (fight note section 5): an empty `spikes`
list derives the ten pillars from the world seed, and the feature stops discarding
`crystal_invulnerable` and `crystal_beam_target`. Verify `end_podium` against the exact shape in
fight note section 2 and fix any difference.

**Files.** New `packages/features/src/features/endSpikes.ts` with test;
`packages/features/src/features/structural.ts` (`endSpike` at 1041-1099 uses the seed list when
`spikes` is empty and forwards the crystal options at 1092-1094; `end_podium` at 983-1010);
`packages/features/src/world/FeatureWorld.ts` (`spawnEntity` at 147 gains options, and the
interface exposes the world seed if it does not already); `packages/features/README.md`.

**Public API.**

```ts
export interface EndSpike { centerX; centerZ; radius; height; guarded }
export const endSpikesForSeed: (seed: bigint) => readonly EndSpike[];
// FeatureWorld
spawnEntity?(identifier: string, position: Vec3, options?: {
    yaw?: number; beamTarget?: { x; y; z }; showBottom?: boolean; invulnerable?: boolean;
}): void;
```

`endSpikesForSeed` ports Java's two-step derivation: key = Java-LCG(seed).nextLong() & 65535n,
then Fisher-Yates over 0..9 with Java-LCG(key) (`nextInt(i)` swaps as the fight note says),
positions `floor(42 * cos/sin(2 * (-PI + 0.3141592653589793 * i)))`, radius `2 + n/3`, height
`76 + 3n`, guarded at n 1 and 2. Reuse an existing Java `Random` port if one is importable (the
worldgen package has the LCG); otherwise implement the 48-bit LCG locally with a JSDoc citing
`SpikeCacheLoader.load`.

**Tests.** The ten positions match the fight note's list for any seed; radius, height and
guarded per shuffled index; one pinned seed's full spike list asserted (compute once, cite the
derivation); empty `spikes` in the config produces the seed list; crystal options reach
`spawnEntity`; the podium test covers the 12 rim cells, 20 portal cells when active and air when
inactive, the 4-high pillar and the 4 torches.

**Changeset.** `@jsprismarine/features` patch.

**Verify.** **package** on features, **types**, **custom**.

**Done when** `endSpike` with the vanilla `{"spikes": []}` config places ten pillars in a test
harness and the crystal spawn carries beam, bottom and invulnerable.

**Depends on** nothing.

### Chunk 2: end crystal and dragon runtime behavior in `@jsprismarine/prismarine`

**Goal.** A spawned `minecraft:ender_crystal` shows its beam and base to the client, explodes
when hit, and can be invulnerable; the data-driven death path stops racing the explode fuse.

**Files.** `packages/prismarine/src/entity/data/actorMetadata.ts` (a `position` property kind at
25-30; project a runtime beam target to `ActorDataID.BLOCK_TARGET = 47` and show-bottom to
`ActorFlags.SHOW_BOTTOM = 38`), `packages/prismarine/src/entity/data/liveBodies.ts` (apply at
227-228 and 308-311), `packages/prismarine/src/entity/data/EntityRuntime.ts` (`SpawnOptions` in
`scene.ts:25-45` gains `beamTarget`, `showBottom`, `invulnerable`; the death path at 916-941 runs
a pending `minecraft:explode` fuse before removal; `hurt` refuses damage to an invulnerable
record), `packages/protocol/src/wire/structures/Metadata.ts` only if `setPropertyValue` cannot
already carry `FlagType.POSITION` (it can per fight note section 9; do not add a `MetadataFlag`
member without need), tests beside each.

**Public API.** `SpawnOptions` gains the three optional fields; a runtime record carries
`beamTarget?: Vec3`, `showBottom?: boolean`, `invulnerable?: boolean`, persisted in the actor
record JSON like other component state.

**Tests.** A spawned crystal's `AddActor` metadata carries key 47 as a position and the
SHOW_BOTTOM flag state; setting the beam at runtime emits `SetActorData`; a melee hit on a
1-health crystal produces one explosion (power 6, no fire, from the pack's `crystal_exploding`
group) and the entity is removed; an invulnerable crystal takes no damage from melee or
explosions; a crystal destroyed by an explosion does not explode again (Java parity, fight note
section 4); the record round-trips through save and restore.

**Changeset.** `@jsprismarine/prismarine` patch (and `@jsprismarine/protocol` patch only if
Metadata changes).

**Verify.** **package** on prismarine, **types**, **custom**.

**Done when** the live test (follow `packages/prismarine/src/entity/data/live.test.ts`) shows a
hit crystal exploding and an invulnerable one surviving.

**Depends on** nothing.

### Chunk 3: a boss bar sender in `@jsprismarine/prismarine`

**Goal.** A reusable server-side boss bar over `BossEventPacket`, which nothing sends today.

**Files.** New `packages/prismarine/src/network/BossBar.ts` with test;
`packages/prismarine/src/network/PlayerSession.ts` only if a send helper is missing.

**Public API.**

```ts
export class BossBar {
    constructor(options: { actorUniqueId: bigint; name: string; color?: BossBarColor; overlay?: BossBarOverlay });
    addPlayer(player: Player): void;      // sends Add (0)
    removePlayer(player: Player): void;   // sends Remove (2)
    setPercent(value: number): void;      // clamped 0..1, sends UpdatePercent (4) to current players
    setName(name: string): void;          // sends UpdateName (5)
    players(): readonly Player[];
}
```

The packet layout is flat since 2193 (`packages/protocol/src/wire/definitions/bossEvent.ts:19-34`);
fill every field on every event. Answer the serverbound `Query` (8) with an Add to the asking
player.

**Tests.** Packet capture over `fakePlayer()`: Add on addPlayer with name, percent, color and
overlay; UpdatePercent only to added players; Remove on removePlayer and on a player disconnect;
Query answered.

**Changeset.** `@jsprismarine/prismarine` patch.

**Verify.** **package** on prismarine, **types**, **custom**.

**Done when** the tests pass; nothing uses the class yet.

**Depends on** nothing.

### Chunk 4: the credits round trip

**Goal.** A player entering the End's exit portal sees the credits once and lands at their
respawn point; the next entry skips the credits. Java's rule set, fight note section 7.

**Files.** `packages/prismarine/src/world/portal/DimensionTravel.ts` (`leaveEnd` at 329-352 and
`transfer` at 146-174: for a player without `seenCredits`, send
`ShowCreditsPacket(StartCredits)`, hold the resolved arrival, set `seenCredits`, and do not call
`changeWorld` yet), `packages/prismarine/src/network/handler/ShowCreditsHandler.ts` (on
`EndCredits`, complete the held arrival through `PlayerSession.changeWorld`; an unexpected reply
is logged and dropped), `packages/prismarine/src/network/PlayerSession.ts` (a
`pendingCredits?: Arrival` beside the pending dimension change at 1509-1518; drop
`PlayerAuthInput` while it is set, as the pending change already does),
`packages/prismarine/src/Player.ts` and the player record (`seenCredits` on `WorldPlayerData`
in `packages/prismarine/src/config/JsonConfigTypes.ts`, `PlayerCodec` writes Bedrock's
`HasSeenCredits`, schema regenerated with `pnpm --filter @jsprismarine/prismarine run generate`),
`packages/client/src/Credits.ts` (new responder: on `ShowCredits` Start, reply `EndCredits`,
following `packages/client/src/DimensionChange.ts:44-124`), new
`packages/client/src/Credits.test.ts` following `DimensionChange.test.ts:43-211` (own port).

**Public API.** `Player.hasSeenCredits(): boolean` and `setSeenCredits(value: boolean)`;
`PlayerSession.startCredits(arrival: Arrival): void` and `completeCredits(): Promise<boolean>`.

**Tests.** Unit: a first End exit sends one `ShowCredits` Start and no `ChangeDimension` until
the reply; the reply triggers the full change sequence to the respawn point with
`respawn: true`; a second exit skips straight to `changeWorld`; `seenCredits` round-trips
through the player record; a reply with no pending credits is logged. Integration (client
package): boot a flat Overworld plus eager End (`jsprismarine:void` End stem keeps the test off
the Java cache), place the player in the End, write `minecraft:end_portal` under them with
`setBlockByName`, assert `ShowCredits` Start arrives, reply, assert `ChangeDimension` to
dimension 0 and arrival at the spawn.

**Changeset.** `@jsprismarine/prismarine` patch, `@jsprismarine/client` patch.

**Verify.** **package** on prismarine and client, **types**, **custom**. Note open question 4 in
the commit body.

**Done when** the integration test passes and `ShowCreditsHandler` no longer only logs.

**Depends on** nothing (uses today's `leaveEnd`).

---

## Wave 1: pillars in the world, the fight service

### Chunk 5: End chunks grow pillars and crystals

**Goal.** Generated End chunks contain the ten obsidian pillars, cages, bedrock caps, fire and
pending crystal entities with the right options, end to end through the worker.

**Files.** `packages/prismarine/src/world/generators/datadriven/GenerationRegion.ts`
(`featureWorld()` at 589-610 forwards the chunk 1 spawn options and the world seed;
`RegionEntitySpawn` at 90-98), `packages/chunkgen/src/ProtoChunk.ts` (`ProtoEntitySpawn` at
46-54 gains the options), `packages/prismarine/src/world/generators/datadriven/javaGeneratedContent.ts`
(`createEntitySpawn` at 106-111 maps them; `minecraft:end_crystal` already maps to
`minecraft:ender_crystal`), `packages/prismarine/src/world/chunk/Chunk.ts` (309-321),
`packages/prismarine/src/world/World.ts` (`createGeneratedEntities` at 1173-1194 passes the
options into `EntityRuntime.spawn`), new real-data test
`packages/prismarine/src/world/generators/datadriven/DataDrivenGenerator.end.test.ts`,
`packages/parity/src/worldgen.dimensions.test.ts` (427-508).

**Public API.** None new beyond the option plumbing; `ProtoEntitySpawn.options` is additive.

**Tests.** Real-data, seed 1234, gated like the other suites: generate the End chunk holding the
spike at (42, 0) (chunk 2, 0) and assert the obsidian column from the floor to height - 1, air
above 65, bedrock at the top, fire above it, and a pending `minecraft:ender_crystal` at
(42.5, height + 1, 0.5) with `showBottom: false`? No: worldgen crystals keep the default
(`ShowBottom` true in Java; the item sets false). Assert `invulnerable: false` and no beam. Pick
one guarded spike and assert iron bars. The parity test gains those assertions for the
`minecraft:normal` End stem so the family keeps a tested row. The Overworld corpus is untouched;
run it to prove that.

**Changeset.** `@jsprismarine/chunkgen` patch, `@jsprismarine/prismarine` patch.

**Verify.** **package** on chunkgen, prismarine and parity, **types**, **custom**, **corpus**.

**Done when** a freshly generated End at seed 1234 has ten pillars whose crystals spawn when the
chunks load.

**Depends on** chunks 1 and 2.

### Chunk 6: the `DragonFight` service: state, scan, dragon, bar

**Goal.** The End world owns a persistent fight: it knows whether the dragon is alive, keeps the
exit portal location, spawns the dragon when needed, and runs the boss bar.

**Files.** New `packages/prismarine/src/world/end/DragonFight.ts` with test (and
`worldFeatureAdapter.ts` if placing the podium needs a `FeatureWorld` over a live `World`);
`packages/prismarine/src/world/World.ts` (a lazy `getDragonFight()` like `getPortalIndex()` at
1915, created only when the dimension type has `hasEnderDragonFight`; ticked from `World.update`
beside portals at 751); `packages/prismarine/src/world/WorldPersistence.ts` (interface at 43-51,
parser at 62-78), `packages/prismarine/src/world/providers/leveldb/LevelDB.ts` (`writeWorldData`
whitelist at 186-196), their tests.

**Public API.**

```ts
export interface DragonFightState {   // persisted as WorldPersistenceData.dragonFight
    dragonKilled: boolean; previouslyKilled: boolean; needsStateScanning: boolean;
    dragonUniqueId?: bigint; exitPortalLocation?: { x; y; z };
    gateways: number[];               // remaining indices, seed-shuffled on first init
    respawnStage?: 'start' | 'preparing_to_summon_pillars' | 'summoning_pillars' | 'summoning_dragon';
    respawnTime: number; respawnCrystalIds: bigint[];
}
export class DragonFight {
    constructor(world: World, state: DragonFightState | undefined, seed: bigint);
    tick(): void;
    onCrystalDestroyed(entity, source): void;   // chunk 8 wires the caller
    tryRespawn(): boolean;                      // chunk 8
    setDragonKilled(dragon): void;              // chunk 7
    state(): DragonFightState;                  // for persistence
}
```

Behavior in this chunk (fight note sections 1 and 2): persist through
`WorldPersistenceData.dragonFight` (three edits: interface, parser, whitelist; round-trip test);
on first init shuffle `gateways` 0..19 with the Java LCG over the world seed (reuse chunk 1's
LCG); `tick` runs only while a player is within 192 of (0, 128, 0) (the arena ticket is
approximated by "a player is near"; note the simplification in a JSDoc); scan once: find an
exit portal by the bedrock ring pattern within 8 chunks of (0, 0) or place the inactive podium
through the `end_podium` feature and record the location (heightmap at (0, 0), stepping down
through bedrock while y > 63); spawn the dragon through
`EntityRuntime.spawn('minecraft:ender_dragon', (0, 128, 0))` when `!dragonKilled` and none
exists (re-check every 1200 ticks); run a `BossBar` named `entity.minecraft.ender_dragon`
(pink, progress): add and remove players on the 192 radius every 20 ticks, percent from the
dragon's health component. Dragon healing from crystals (+1 per 10 ticks while one is within
32) is included; it is ten lines and changes how beatable the fight feels.

**Tests.** Over the LevelDB harness with a void End stem and hand-written blocks: a fresh fight
scans, places the inactive podium at the heightmap and persists the location; a saved state is
not rescanned; the dragon spawns once and its unique id is kept; the bar adds a near player and
removes a far one; health updates the percent; `state()` round-trips through
`WorldPersistence.test.ts`; the gateway shuffle is stable for a pinned seed.

**Changeset.** `@jsprismarine/prismarine` patch.

**Verify.** **package** on prismarine, **types**, **custom**.

**Done when** joining an End world with the fight enabled yields a dragon actor and a boss bar
in a packet-capture test, and a restart keeps the fight state.

**Depends on** chunks 2 and 3 (chunk 1 for the LCG and the podium feature shape).

---

## Wave 2: death and respawn

### Chunk 7: dragon death opens the portal

**Goal.** Killing the dragon plays the death, opens the exit portal, places the egg on the first
kill, spawns a gateway and pays the XP. Fight note section 3.

**Files.** `packages/prismarine/src/world/end/DragonFight.ts` (`setDragonKilled`);
`packages/prismarine/src/entity/data/EntityRuntime.ts` or `goalWorld.ts:220` (the dragon's
death: keep the 200-tick `dragondeath` hold, send `ActorEvent.DRAGON_START_DEATH_ANIM = 37` at
its start, and notify the world's fight on removal instead of silently discarding);
`packages/entity-goals/src/goals/specials.ts:85-106` only if the goal needs a completion
callback; tests beside each.

**Public API.** None new outside `DragonFight`.

**Tests and behavior.** `setDragonKilled`, in Java's order: bar to 0 and hidden; active podium
placed (end portal blocks fill the ring); one gateway placed by popping the last shuffled index
at `(floor(96 cos(2(-PI + 0.15707963267948966 i))), 75, floor(96 sin(...)))` through the
`end_gateway` feature with no exit (teleport deferred); the egg at the MOTION_BLOCKING heightmap
above (0, 0) on the first kill only; `previouslyKilled` and `dragonKilled` set and persisted. XP:
12000 on the first kill and 500 after, paid as Java pays it (ten awards of `floor(xp * 0.08)`
during the death hold and `floor(xp * 0.2)` at the end) by spawning `xp_orb` entities the way
block breaks do (`packages/block-behaviors/src/families/simple.ts:118` is the precedent); if orb
pickup is still unimplemented, also award the killer directly through `addExperiencePoints`
(`packages/prismarine/src/entity/Experience.ts:47`) and say so in a JSDoc. Tests assert the
block writes (portal ring, egg presence per kill count), the gateway position for a pinned seed,
the XP totals per kill, and that a second kill places no egg.

**Changeset.** `@jsprismarine/prismarine` patch; `@jsprismarine/entity-goals` patch if the goal
changes.

**Verify.** **package** on prismarine (and entity-goals), **types**, **custom**.

**Done when** a test kills the dragon over a void End and the world ends with an open portal, an
egg, a gateway and the XP paid.

**Depends on** chunks 5 and 6.

### Chunk 8: respawning the dragon with four crystals

**Goal.** Placing four end crystals on the exit portal's edges runs the full respawn: beams,
pillar reset with new invulnerable crystals, dragon summon, crystal destruction, with aborts.
Fight note section 6.

**Files.** `packages/item-behaviors/src/behaviors/placement.ts` (112-130: the
`minecraft:end_crystal` path gains Java's placement rules: obsidian or bedrock base, empty block
above, no entities in (x..x+1, y+1..y+3, z..z+1), spawn centered at (x + 0.5, y + 1, z + 0.5)
with `showBottom: false`, then a host hook); the item host adapter in
`packages/prismarine/src/item/contentAdapter.ts:210-217` (route the hook to
`world.getDragonFight()?.tryRespawn()`); `packages/prismarine/src/world/end/DragonFight.ts`
(`tryRespawn`, the stage machine, `onCrystalDestroyed`); the crystal death path notifies the
fight (`EntityRuntime` removal hook from chunk 2); tests beside each.

**Public API.** None new outside `DragonFight`; the item-behaviors hook follows the existing
host-action pattern (`ask the host before spending an item on an action`).

**Behavior.** `tryRespawn` requires `dragonKilled` and no stage, finds crystals in the four
cells at `exitPortalLocation.above(1).relative(dir, 3)`, rewrites the old podium's bedrock and
portal blocks to end stone, rebuilds the inactive podium, and starts the stages. The stages run
in `tick` with Java's numbers: START (beams to (0, 128, 0)), 100 ticks of roar events (open
question 2's candidates), 40 ticks per pillar in `endSpikesForSeed` order (beam to the pillar
top, clear the ±10 box, explosion power 5, re-place that spike through the chunk 1 feature with
`crystalInvulnerable: true` and beam (0, 128, 0)), 100 ticks of summoning (beams to center; at
the end reset pillar crystals to vulnerable with no beam, explode and remove the four respawn
crystals at power 6 with no block damage, spawn the dragon, clear `dragonKilled`). Destroying a
respawn crystal aborts: stage cleared, pillar crystals reset, active podium restored.
`respawnStage`, `respawnTime` and the crystal ids persist, and a reload with missing crystals
aborts.

**Tests.** Item placement accepted on obsidian and bedrock and refused elsewhere or when
blocked; placement on a non-fight world spawns a crystal and nothing else; four crystals start
the sequence and three do not; the stage timeline over a fake clock (beam targets per stage,
pillar re-place order and invulnerability, the summon at the end, totals 601+ ticks); abort on
crystal death mid-sequence restores the active podium; state round-trips mid-sequence.

**Changeset.** `@jsprismarine/item-behaviors` patch, `@jsprismarine/prismarine` patch.

**Verify.** **package** on item-behaviors and prismarine, **types**, **custom**.

**Done when** a test respawns the dragon end to end and a mid-sequence save, reload and crystal
kill both behave.

**Depends on** chunks 6 and 7 (and 1 for the spike re-place, 2 for beams and invulnerability).

---

## Wave 3: proof and documentation

### Chunk 9: parity row, client proof, docs

**Goal.** A parity family pins the data the fight reads, a client integration test proves the
beatable path, and the docs describe it.

**Files.** `packages/parity/src/families.ts` (a `gameplay.end-fight` family), new
`packages/parity/src/gameplay.end-fight.test.ts`, `docs/data-driven/parity.md`; new
`packages/client/src/EndFight.test.ts` (or extend `Credits.test.ts`) following
`DimensionChange.test.ts`; `docs/data-driven/dimensions.md` (the End exit paragraph that says
credits are never shown, and the gateway sentence); a new section in `docs/data-driven/` (either
a page `end-fight.md` or a section of `entities.md`, author's choice) describing the fight,
written with the human-docs and unslop skills; `docs/research/README.md` and
`docs/data-driven/README.md` indexes if a page is added.

**Tests.** Parity, through real data fixtures: the vanilla pack's crystal explode power (6) and
health (1), the dragon's health (200) and `boss.hud_range` (125), the item and entity id
mappings (851/852, 71, 53, `end_crystal` to `ender_crystal`), the spike table for one pinned
seed against the fight note's formulas, and the podium cell counts (12 rim, 20 portal). Client
integration: spawn the dragon in a void End, kill it with repeated attacks (creative player),
assert the boss bar packets, the portal blocks, the egg, then walk the credits round trip from
chunk 4's test and land in the Overworld.

**Changeset.** `@jsprismarine/client` patch; parity is private. Docs ride with the code they
describe where edits touch behavior pages.

**Verify.** **package** on parity and client, **corpus** (the dashboard gains the row),
**types**, **custom**, and `pnpm run lint` for the Markdown.

**Done when** the dashboard shows `gameplay.end-fight` and the client test beats the game.

**Depends on** chunks 4, 7 and 8.

---

## The order, and what it buys

| After wave | What works |
| --- | --- |
| 0 | Spikes derive from a seed in a harness; crystals explode and show beams; a boss bar class exists; the credits round trip works over today's End exit. |
| 1 | A generated End has pillars and crystals; the End world has a dragon, a bar and persisted fight state. |
| 2 | The dragon dies properly: open portal, egg, gateway, XP. Four crystals bring it back. |
| 3 | A parity row and a client test prove it; the docs describe it. |

## Risks, worst first

1. **The death race in chunk 2.** The crystal fix touches the shared death path
   (`EntityRuntime.ts:916-941`); a regression there affects every data-driven mob. Keep the
   change to "run a zero-fuse explode queued by the killing hit before removal" and lean on the
   live tests.
2. **The fight's block writes run inside a tick.** `setDragonKilled` and the respawn stages
   write dozens of blocks and one explosion per pillar; batch through the normal block write
   path and spread nothing across ticks that Java does not (the stages are already paced at 40
   ticks per pillar).
3. **Boss bar visibility (open question 1).** If the retail client drops the bar out of range,
   chunk 6 needs the dummy-actor fallback; design `BossBar` so the actor id is a constructor
   input, not a hard bind to the dragon.
4. **The End generation change in chunk 5.** New End chunk bytes are intended, but the worker
   plumbing touches `ProtoChunk` and the pipeline; the Overworld corpus run is the guard that
   nothing else moved.
5. **Respawn-state persistence.** A save mid-sequence with entity references is the only place
   the fight stores entity ids; resolve them leniently and abort when they are gone, as Java
   does, rather than crashing a load.
