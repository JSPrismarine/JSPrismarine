# @jsprismarine/spawning

[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/6w8JWhy)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/spawning)](https://www.npmjs.com/package/@jsprismarine/spawning)

Bedrock natural spawning: the `spawn_rules/*.json` grammar, the condition evaluator, the population
pools and the spawn loop. It builds on `@jsprismarine/packs` for the filter grammar, on
`@jsprismarine/entities` for the filter evaluator that spawn rules, entity definitions and trade
tables all share, and on `@jsprismarine/predicates` for the injected random source.

```typescript
import { Spawner, parseSpawnRule } from '@jsprismarine/spawning';
import { seededRandom } from '@jsprismarine/predicates';

const rules = files.map((file) => parseSpawnRule(file.data, { pack: file.pack, path: file.path }));
const spawner = new Spawner({ rules: rules.filter((rule) => rule !== undefined), world, random: seededRandom(seed) });

for (const request of spawner.tick(tick)) {
    world.create(request.identifier, request.position, request.spawnEvent);
}
```

## The grammar

A file is `{"format_version": "<semver>", "minecraft:spawn_rules": {description, conditions}}`.
`description` carries `identifier` and `population_control`; `conditions` is a list of alternatives,
and a rule allows a position when any one of them does.

`parseSpawnRule` reads all 24 components `Spawn Rules.json` declares and reports an unknown one
rather than refusing the file, so a pack written against a newer game still loads. Vanilla writes 21
of the 24. The three it never writes, `minecraft:spawns_above_block_filter`,
`minecraft:is_persistent` and `minecraft:is_experimental`, parse into the condition and keep their
meaning for the caller, because Mojang documents none of them.

Three components are written in more than one shape, and all of them read:

- `minecraft:spawns_on_block_filter` as one name, as a list of names, or as a list of `{name}`
  objects.
- `minecraft:herd` as one object or as a list of alternatives, which is how the tropical fish picks
  a color event.
- `minecraft:biome_filter` as one test, as a bare array (an implicit `all_of`), or as a group map.
  `@jsprismarine/packs` parses it, including the integer `subject` and `operator` encoding and the
  `AND`, `OR` and `NOT` aliases.

`minecraft:permute_type` entries read both spellings of their third field: the schema's
`min_guaranteed` and the documentation page's `guaranteed_count`.

## What a condition decides

`evaluateSpawnCondition` runs the components cheapest first and names the first one that rejected
the position, so a server can explain an empty attempt and a test can name the component it covers.

| Component | What it compares |
| --- | --- |
| `minecraft:spawns_on_surface`, `minecraft:spawns_underground` | The pass the position is in. Naming both takes either; naming neither takes any. |
| `minecraft:spawns_underwater`, `minecraft:spawns_lava` | The medium. Naming neither refuses a position inside either liquid. |
| `minecraft:disallow_spawns_in_bubble` | A bubble column at the position. |
| `minecraft:height_filter` | The position's Y against the inclusive range. |
| `minecraft:spawns_on_block_filter`, `minecraft:spawns_on_block_prevented_filter` | The block one below the position. |
| `minecraft:spawns_above_block_filter` | The `distance` blocks below the position. |
| `minecraft:brightness_filter` | The light the world reports, lowered by the weather when `adjust_for_weather` is set. |
| `minecraft:difficulty_filter` | The world difficulty against the inclusive range. |
| `minecraft:world_age_filter` | The world age in ticks; a maximum of -1 is no upper bound. |
| `minecraft:mob_event_filter` | Whether the named mob event is running. |
| `minecraft:distance_filter` | The distance to the nearest player. |
| `minecraft:player_in_village_filter` | A player within `distance` who is within `village_border_tolerance` of a village border. |
| `minecraft:biome_filter` | The shared filter grammar, through the `@jsprismarine/entities` evaluator. |
| `minecraft:density_limit` | How many entities of this type stand within `densityRadius`, per pass. |
| `minecraft:delay_filter` | A cooldown keyed by the filter's `identifier`, then a `spawn_chance` roll. |

The remaining six components are not gates. `minecraft:weight` and its `rarity` pick between the
conditions that passed, `minecraft:herd` and `minecraft:permute_type` build the group, and
`minecraft:spawn_event`, `minecraft:is_persistent` and `minecraft:is_experimental` describe what
spawns.

Three readings in that table are this project's, because Mojang states the component and not the
rule. A condition that names neither liquid refuses a position inside one, which is what keeps cows
out of the ocean. `minecraft:spawns_above_block_filter` scans downward, because an entity "above a
block" stands on it. `rarity` is read as a one-in-N roll on top of the weight, which is the only
reading under which a rarity of 3 makes a spawn rarer.

## The spawn loop

Mojang's spawn cycle diagram names six steps, "check spawn conditions, find valid spawn locations,
check population caps, evaluate spawn weight, spawn entity, and run spawn event".
`Spawner.tick(tick)` runs them for every pool whose cadence falls on that tick, and
`Spawner.cycle(pool, tick)` runs one pool on demand.

One cycle of one pool:

1. Read the pool's cap. A `per_player` cap multiplies by the players in the region; a `per_region`
   cap does not. A pool with no cap, which is the pillager pool, skips the check.
2. For each player, sample `chunksPerCycle` chunks inside `spawnRadiusChunks`.
3. In each chunk, try `positionsPerChunk` positions for the surface pass, where Y is
   `SpawnWorld.surfaceY`, and the same number for the underground pass, where Y is drawn between
   `SpawnWorld.minY` and the surface.
4. At each position, collect every condition of every rule in the pool that passes, draw one
   weighted by `minecraft:weight.default`, then apply its `rarity` roll.
5. Draw a herd size inside the chosen `minecraft:herd` alternative, place the first member at the
   position and the rest within `herdRadius`, following the terrain on the surface pass. Reject
   each member within `minimumSpawnDistance` of any player or inside that distance from the current
   world spawn.
6. Give each member its entity type and spawn event. `minecraft:permute_type` swaps the type, taking
   its `min_guaranteed` members first and drawing the rest by weight, and the
   `minecraft:pillager<minecraft:spawn_as_patrol_follower>` form splits into a type and an event.
   The event is `initial_event` for the first `initial_event_count` members, then `event` for every
   member past `event_skip_count`, then the permutation's own event, then
   `minecraft:spawn_event`.
7. Stop as soon as the pool reaches its cap, mid-herd if that is where the cap falls.

`despawnReason` carries the two rules that belong to the population rather than to an entity: the
published Y floor of -128, and the edge of the simulated region. The per-entity policy is
`minecraft:despawn` in `@jsprismarine/entities`, which this package does not duplicate.

## The injected seams

`SpawnWorld` is the one interface the loop reads the world through, so a test drives the whole
algorithm with a typed double and a server implements it once.

- `site(flag, at)` answers the six site facts, each named by the component or filter test that
  reads it: `surface`, `underground`, `underwater`, `lava`, `bubble_column` and `snow_covered`.
- `block(at)`, `light(at)`, `biomeTags(at)` and `biome(at)` answer one position.
- `surfaceY(x, z)` and `minY()` give the two passes their Y.
- `players()` and `worldSpawn()` answer the player and world-spawn distances. `poolCount(pool)` and
  `typeCount(identifier, at, radius)` answer the caps and the density limit.
- `difficulty()`, `weather()`, `age()`, `mobEventActive(event)` and `villageBorderDistance(at)`
  answer the rest.

`RandomSource` from `@jsprismarine/predicates` is the only source of randomness, so one seed
reproduces one set of spawns. `SpawnDelays` holds the `minecraft:delay_filter` cooldowns and a
caller can persist it across a restart. `SpawnConstants` replaces the numbers below.

## Which numbers Mojang publishes

Mojang documents the pool names and every component's parameters, but the spawn-rule data has no
field for the algorithm's attempt rate, population caps, sampling radius, herd placement, or density
radius. It also does not state which light value `minecraft:brightness_filter` compares or what
`adjust_for_weather` does to it. The research note
[`docs/research/bedrock-entities-spawning-loot-trading.md`](../../docs/research/bedrock-entities-spawning-loot-trading.md)
section 4 lists the gaps one by one.

The one place numbers appear is the "Typical Cap" column of `EntitySpawningDeepDive.md`, and every
entry there is hedged with a tilde: `animal` "~10 per player", `monster` "~70 in loaded chunks",
`water_animal` "~5 per water body", `water_ambient` "~20 per water body", `ambient` "~15 in caves",
`pillager` "Limited by patrols".

Most numbers this package uses are this project's choices. They live in
[`src/tables/spawnConstants.json`](src/tables/spawnConstants.json) rather than in code, each with a
`source` string, so a reader can judge them and a host can replace the whole table through
`SpawnerOptions.constants`.

The minimum spawn distance is the exception. Java 26.3's `NaturalSpawner` rejects spawn positions
at or within 24 blocks of a player and inside 24 blocks of the shared world spawn in its dimension.
The spawner reads this radius from the same JSON table and checks every herd member as well as the
initial position. Mojang's Bedrock spawn-rule files do not carry this distance.

| Constant | Value | Where it came from |
| --- | --- | --- |
| `pools.animal.cap` | 10 per player | The tilde-hedged "~10 per player". |
| `pools.water_animal.cap` | 5 per player | "~5 per water body". A water body is not a quantity this server tracks, so the cap counts per player. |
| `pools.water_ambient.cap` | 20 per player | "~20 per water body". No vanilla rule names this pool. |
| `pools.ambient.cap` | 15 per player | "~15 in caves". Only the bat uses this pool. |
| `pools.monster.cap` | 70 per region | "~70 in loaded chunks", so it covers the region rather than scaling with players. |
| `pools.cat.cap` | 5 per region | Mojang says only that cat limits are "based upon the amount within a village" and gives no number. |
| `pools.pillager.cap` | none | "Limited by patrols", so `minecraft:delay_filter` and `minecraft:mob_event_filter` gate it instead. |
| `pools.*.cycleTicks` | 400 for the calm pools, 20 for monsters and pillagers, 1200 for cats | Mojang publishes no rate. Java's animal pass runs every 400 ticks and its monster pass every tick; 20 is this project's cheaper monster cadence. |
| `spawnRadiusChunks` | 4 | Bedrock's documented default simulation distance, because the ticking area documentation says spawning happens "in a radius centered on a player". |
| `minimumSpawnDistance` | 24 blocks | Java 26.3's `NaturalSpawner.isRightDistanceToPlayerAndSpawnPoint`; excludes near-player and near-world-spawn positions. |
| `chunksPerCycle`, `positionsPerChunk` | 8 and 3 | This project's budget, picked so one player in an empty plains biome reaches the animal cap within a few cycles. |
| `herdRadius` | 5 blocks | Java's horizontal pack spread. |
| `densityRadius` | 16 blocks | One chunk's width, as this project's reading of the "certain locations" the density limit talks about. |
| `rainDarkening`, `thunderDarkening` | 5 and 10 | Java's `Level.getSkyDarken` subtracts these under rain and thunder. |
| `despawnRadiusChunks` | 8 | The 128 blocks of `minecraft:despawn.despawn_from_distance.max_distance`, the one published spawning distance. |
| `despawnFloorY` | -128 | Published, and the same in both editions. |

The project chose Bedrock's model over Java's deliberately.
[`docs/plans/data-driven-vanilla.md`](../../docs/plans/data-driven-vanilla.md) section 12 decision 3
records why: Java's model is implementable and invisible to a Bedrock client, and it would break
every farm a Bedrock player has built.

## Measured coverage

Against the composed vanilla behavior pack of Bedrock Dedicated Server 1.26.51.1, through the corpus
test in `src/vanillaSpawnRules.test.ts`:

| Measure | Result |
| --- | --- |
| Spawn rule files composed | 60 |
| Files that parse with no diagnostic | 60 |
| Condition components the schema declares | 24, all parsed |
| Condition components vanilla writes | 21, all evaluated |
| Population pools in vanilla | `animal` 27, `monster` 24, `water_animal` 5, `pillager` 2, `cat` 1, `ambient` 1 |
| Rules with no conditions | 4: blaze, cat, pillager, wither skeleton |
| Biome filter tests left unanswered by the spawn filter context | 0 |

The corpus test needs the sources that `pnpm --filter @jsprismarine/bedrock-data run fetch:sources`
caches and runs only with `JSP_VANILLA_SPAWN_RULES` set:

```sh
JSP_VANILLA_SPAWN_RULES=1 pnpm --filter @jsprismarine/spawning exec vitest run src/vanillaSpawnRules.test.ts
```

## What a later agent adds

- **The four rules with no conditions.** Blaze, cat, pillager and wither skeleton register a pool
  and leave placement to engine code: fortress spawns, village cats and patrol placement. This
  package spawns them wherever the pool cycle looks, which is wrong for all four.
- **Structure-based spawn selection.** When the world supplies Java structure data, the spawner
  suppresses a rule candidate if Java reserves that entity type exclusively for structure
  overrides and the candidate is outside every matching structure. This keeps guardians out of
  ordinary ocean water while leaving entities also listed in Java biome spawn tables eligible
  outside structures. Structure overrides do not yet create spawn attempts or replace the biome
  category's weighted selection.
- **Measuring the constants.** Every number in the table above is replaceable, and a capture against
  a running BDS would turn the guesses into measurements.
