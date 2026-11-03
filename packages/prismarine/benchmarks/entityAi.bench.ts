/**
 * Benchmark: the data-driven entity runtime's cost per tick.
 *
 * Everything below the harness is real: the vanilla behavior pack is loaded
 * through the real pack stack, so a zombie here carries the goals the shipped
 * `zombie.json` declares, and the goals run against the real `EntityRuntime`,
 * the real goal world and the real path finder. Set `ENTITY_AI_REAL_CHUNKS=1`
 * to back a 441-chunk scene with production `Chunk` storage and report its
 * underlying runtime-id reads. Set `ENTITY_AI_LIVE_PLAYERS=1` to model the live
 * adapter's per-read player-list mapping and report snapshot/view allocations.
 * Set `ENTITY_AI_BRAIN_MOBS=1` to spawn the twenty brain mobs and count measured
 * tag-registry scans and membership checks.
 * Set `ENTITY_AI_AVOID_BLOCK=1` to run the piglin/hoglin 17×9×17 nearest-block
 * query every five ticks and report matching query results.
 * Set `ENTITY_AI_SENSING=1` to make hostile mobs repeat `canSee` against one
 * nearby player each tick and report calls that reached the block ray.
 *
 * Run: node packages/prismarine/benchmarks/run.mjs \
 *        packages/prismarine/benchmarks/entityAi.bench.ts [mob counts...]
 * Production-shaped run: ENTITY_AI_REAL_CHUNKS=1 ENTITY_AI_TICKS=40 node \
 *        packages/prismarine/benchmarks/run.mjs packages/prismarine/benchmarks/entityAi.bench.ts 300
 * Player allocation run: ENTITY_AI_LIVE_PLAYERS=1 ENTITY_AI_TICKS=40 node \
 *        packages/prismarine/benchmarks/run.mjs packages/prismarine/benchmarks/entityAi.bench.ts 300
 * Brain-mob run: ENTITY_AI_BRAIN_MOBS=1 ENTITY_AI_TICKS=40 node \
 *        packages/prismarine/benchmarks/run.mjs packages/prismarine/benchmarks/entityAi.bench.ts 300
 * Avoid-block query run: ENTITY_AI_AVOID_BLOCK=1 ENTITY_AI_TICKS=40 node \
 *        packages/prismarine/benchmarks/run.mjs packages/prismarine/benchmarks/entityAi.bench.ts 300
 * Sensing run: ENTITY_AI_SENSING=1 ENTITY_AI_TICKS=40 node \
 *        packages/prismarine/benchmarks/run.mjs packages/prismarine/benchmarks/entityAi.bench.ts 300
 */
import type { EntityPosition, FilterEntityView } from '@jsprismarine/entities';
import type { GoalMob } from '@jsprismarine/entity-goals';
import { BRAIN_MOBS } from '@jsprismarine/entity-brains';
import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';

import { BlockRuntimeIds } from '../src/block/state/BlockRuntimeIds';
import { singleDimension } from '../src/content/world/adapter';
import type {
    ContentBlock,
    ContentEntity,
    ContentItemDrop,
    ContentPosition,
    ContentTickScheduler,
    RandomSource,
    ServerWorldAdapter
} from '../src/content/world/adapter';
import { buildServerContent } from '../src/content/ServerContent';
import type { ServerContent } from '../src/content/ServerContent';
import type { ContentTags } from '../src/content/tags';
import { entityContentGroups } from '../src/entity/contentAdapter';
import { EntityRuntime } from '../src/entity/data/EntityRuntime';
import type { ContentItemEntity, EntityHostFacts, EntityWorldFacts } from '../src/entity/data/host';
import Chunk from '../src/world/chunk/Chunk';

/** The y the flat floor's top sits at; everything above it is air. */
const FLOOR_Y = 63;
const PRODUCTION_CHUNKS = process.env.ENTITY_AI_REAL_CHUNKS === '1';
const PRODUCTION_PLAYERS = process.env.ENTITY_AI_LIVE_PLAYERS === '1';
const BRAIN_MOB_PROFILE = process.env.ENTITY_AI_BRAIN_MOBS === '1';
const AVOID_BLOCK_PROFILE = process.env.ENTITY_AI_AVOID_BLOCK === '1';
const SENSING_PROFILE = process.env.ENTITY_AI_SENSING === '1';
const CHUNK_RADIUS = PRODUCTION_CHUNKS ? 10 : 0;
const CHUNK_COUNT = (CHUNK_RADIUS * 2 + 1) ** 2;
const SPREAD = PRODUCTION_CHUNKS ? 320 : 64;

/** A deterministic random source, so two runs of the harness draw the same numbers. */
const seededRandom = (seed: number): RandomSource => {
    let state = seed >>> 0 || 1;
    const next = () => {
        state ^= state << 13;
        state >>>= 0;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;
        return state / 0x1_0000_0000;
    };
    return { nextFloat: next, nextInt: (bound) => (bound <= 0 ? 0 : Math.floor(next() * bound)) };
};

/** One block position as a map key. */
const keyOf = (at: ContentPosition): string => `${at.x},${at.y},${at.z}`;

/** The flat world the mobs stand in, built once rather than per read. */
const benchWorld = (random: RandomSource, blockReads: { count: number }, gameTime: () => number = () => 0) => {
    const placed = new Map<string, ContentBlock>();
    const chunks = new Map<string, Chunk>();
    const chunkAt = (at: ContentPosition): Chunk | undefined => chunks.get(`${at.x >> 4},${at.z >> 4}`);
    let blockRevision = 0;
    if (PRODUCTION_CHUNKS) {
        const stone = BlockRuntimeIds.getByName('minecraft:stone');
        for (let x = -CHUNK_RADIUS; x <= CHUNK_RADIUS; x += 1) {
            for (let z = -CHUNK_RADIUS; z <= CHUNK_RADIUS; z += 1) {
                const chunk = new Chunk(x, z);
                for (let localX = 0; localX < 16; localX += 1) {
                    for (let localZ = 0; localZ < 16; localZ += 1) {
                        chunk.fillColumn(localX, localZ, FLOOR_Y, FLOOR_Y, stone);
                    }
                }
                chunks.set(`${x},${z}`, chunk);
            }
        }
    }
    const world: EntityWorldFacts = {
        level: {
            dimension: 'minecraft:overworld',
            minY: -64,
            maxY: 320,
            hasSkyLight: true,
            seaLevel: 62,
            seed: 0n,
            gameTime,
            dayTime: () => 0,
            difficulty: () => 'normal',
            weather: () => 'clear',
            isRainingAt: () => false,
            spawnPosition: () => ({ x: 0, y: FLOOR_Y + 1, z: 0 }),
            gameRule: () => undefined
        },
        blocks: {
            get: (at) => {
                blockReads.count++;
                if (PRODUCTION_CHUNKS) {
                    const chunk = chunkAt(at);
                    if (chunk === undefined) return undefined;
                    const state = BlockRuntimeIds.getState(chunk.getBlockRuntimeId(at.x, at.y, at.z));
                    return state === null ? undefined : { identifier: state.name, states: state.properties };
                }
                return (
                    placed.get(keyOf(at)) ?? {
                        identifier: at.y > FLOOR_Y ? 'minecraft:air' : 'minecraft:stone',
                        states: {}
                    }
                );
            },
            set: (at, block) => {
                if (PRODUCTION_CHUNKS) {
                    const chunk = chunkAt(at);
                    const runtimeId = BlockRuntimeIds.tryGetByState(block.identifier, block.states);
                    if (chunk === undefined || runtimeId === null) return;
                    chunk.setBlockRuntimeId(at.x & 0xf, at.y, at.z & 0xf, runtimeId);
                    blockRevision += 1;
                    return;
                }
                placed.set(keyOf(at), block);
                if (SENSING_PROFILE) blockRevision += 1;
            },
            ...(SENSING_PROFILE ? { blockRevision: () => blockRevision } : {}),
            ...(PRODUCTION_CHUNKS
                ? {
                      blockRevision: () => blockRevision,
                      blockChunkIdentityAt: (at: ContentPosition) => chunkAt(at),
                      blockChunkRevisionAt: (at: ContentPosition) => chunkAt(at)?.getBlockRevision(),
                      runtimeIdAt: (at: ContentPosition) => {
                          const chunk = chunkAt(at);
                          if (chunk === undefined) return undefined;
                          blockReads.count += 1;
                          return chunk.getBlockRuntimeId(at.x, at.y, at.z);
                      }
                  }
                : {}),
            notifyNeighbors: () => undefined,
            data: () => undefined,
            setData: () => undefined,
            light: (at) => (at.y > FLOOR_Y ? 15 : 0),
            power: () => 0,
            isLoaded: (at) => !PRODUCTION_CHUNKS || chunkAt(at) !== undefined,
            surfaceY: () => FLOOR_Y + 1,
            biome: () => 'minecraft:plains',
            biomeTags: () => ['minecraft:plains']
        },
        effects: { playSound: () => undefined, spawnParticle: () => undefined, emitGameEvent: () => undefined },
        random
    };
    return world;
};

/** The host facts, with optional live-adapter allocation behavior and reusable player views. */
const benchHost = (players: readonly ContentEntity[], allocations: { playerLists: number; playerViews: number }) => {
    const lying = new Map<number, ContentItemEntity>();
    const viewByPlayer = new WeakMap<ContentEntity, FilterEntityView>();
    let nextItemId = 1;
    const host: EntityHostFacts = {
        players: () => {
            if (!PRODUCTION_PLAYERS) return players;
            allocations.playerLists += 1;
            // The live world adapter maps stable Player objects to fresh content views.
            return players.map((player) => ({ ...player, position: { ...player.position } }));
        },
        playerView: (id) => {
            const player = players.find((candidate) => candidate.id === id);
            if (player === undefined) return undefined;
            const cached = viewByPlayer.get(player);
            if (cached !== undefined) return cached;

            allocations.playerViews += 1;
            const view: FilterEntityView = {
                id: () => id,
                names: (name) => (name === 'is_family' ? ['player'] : undefined)
            };
            viewByPlayer.set(player, view);
            return view;
        },
        drop: (position, item: ContentItemDrop) => {
            lying.set(nextItemId, { id: nextItemId, position, item });
            nextItemId += 1;
        },
        items: () => [...lying.values()],
        takeItem: (id) => {
            const found = lying.get(id);
            lying.delete(id);
            return found?.item;
        },
        hurt: () => undefined,
        mobEventActive: () => false
    };
    return host;
};

const ticks: ContentTickScheduler = { schedule: () => undefined, isScheduled: () => false, runsThisTick: () => false };

/** The mobs the harness spawns, cycled in this order. */
const MIX = [
    'minecraft:zombie',
    'minecraft:cow',
    'minecraft:skeleton',
    'minecraft:sheep',
    'minecraft:creeper',
    'minecraft:cat',
    'minecraft:ocelot',
    'minecraft:wolf',
    'minecraft:pig',
    'minecraft:spider',
    'minecraft:chicken'
] as const;

/** Every supported brain mob, mapped from Java to the Bedrock id the runtime spawns. */
const BRAIN_MOB_MIX = BRAIN_MOBS.map(({ id }) => {
    const mapped = javaEntityTypeToBedrock(id);
    return mapped.kind === 'mapped' ? mapped.bedrock : id;
});
const AVOID_BLOCK_MIX = ['minecraft:piglin', 'minecraft:hoglin'] as const;
const SENSING_MIX = ['minecraft:zombie', 'minecraft:skeleton', 'minecraft:spider', 'minecraft:creeper'] as const;
const SENSING_TYPES = new Set<string>(SENSING_MIX);
const SENSING_REPEATS = 4;

interface TagScanCounts {
    enumerations: number;
    membershipChecks: number;
}

/** Counts registry enumeration and membership work performed by tag-backed brain sensors. */
const instrumentTags = (tags: ContentTags, counts: TagScanCounts): ContentTags => ({
    registries: tags.registries,
    diagnostics: tags.diagnostics,
    size: tags.size,
    tags: (registry) => {
        counts.enumerations += 1;
        return tags.tags(registry);
    },
    has: (registry, tag) => tags.has(registry, tag),
    members: (registry, tag) => tags.members(registry, tag),
    includes: (registry, tag, identifier) => {
        counts.membershipChecks += 1;
        return tags.includes(registry, tag, identifier);
    }
});

/** How many players walk among the mobs, which is what keeps the targeting goals live. */
const PLAYERS = 2;

/** Builds a runtime with `count` mobs standing in it, and players walking among them. */
const scenario = (count: number, seed: number) => {
    const random = seededRandom(seed);
    const blockReads = { count: 0 };
    let currentTick = 0;
    const world = benchWorld(random, blockReads, () => (SENSING_PROFILE ? currentTick : 0));
    const players: ContentEntity[] = Array.from({ length: PLAYERS }, (_unused, index) => ({
        id: 100_000 + index,
        identifier: 'minecraft:player',
        position: { x: 0, y: FLOOR_Y + 1, z: 0 }
    }));
    /**
     * Walks the players in circles.
     *
     * A settled scene is not what a server runs: a player who stands still
     * lets every targeting and following goal reach its destination and stop,
     * and the tick falls to what an idle mob costs. Moving them keeps the
     * goals re-targeting and re-pathing the way they do in play.
     */
    const walkPlayers = (tick: number): void => {
        currentTick = tick;
        for (const [index, player] of players.entries()) {
            if (SENSING_PROFILE) {
                player.position = { x: 0, y: FLOOR_Y + 1, z: 0 };
                continue;
            }
            const angle = tick / 40 + (index * 2 * Math.PI) / PLAYERS;
            player.position = {
                x: Math.cos(angle) * (SPREAD / 4),
                y: FLOOR_Y + 1,
                z: Math.sin(angle) * (SPREAD / 4)
            };
        }
    };
    const allocations = { playerLists: 0, playerViews: 0 };
    const tagScans: TagScanCounts = { enumerations: 0, membershipChecks: 0 };
    const avoidBlockResults = { count: 0 };
    const sensingCounts = { calls: 0, visible: 0, rays: 0 };
    const host = benchHost(players, allocations);

    let content: ServerContent | undefined;
    const runtime = new EntityRuntime({
        content: () => {
            if (content === undefined) throw new Error('the runtime was read before the content was built');
            return content;
        },
        world,
        host,
        report: () => undefined
    });

    const adapter: ServerWorldAdapter = { ...world, ticks, ...entityContentGroups(runtime) };
    const builtContent = buildServerContent({ world: singleDimension(adapter) });
    content = BRAIN_MOB_PROFILE ? { ...builtContent, tags: instrumentTags(builtContent.tags, tagScans) } : builtContent;

    // A separate stream for the layout, so changing the mob count does not shift the
    // numbers the goals draw.
    const layout = seededRandom(seed * 7919 + 13);
    const breedingIds: number[] = [];
    for (let index = 0; index < count; index += 1) {
        const pair = Math.trunc(index / 2);
        const at: EntityPosition = SENSING_PROFILE
            ? {
                  x: (index % 20) * 1.3 - 12.35,
                  y: FLOOR_Y + 1,
                  z: Math.floor(index / 20) * 1.3 - 9.1
              }
            : BREEDING_PAIRS > 0
              ? {
                    x: (pair % 32) * 24 + (index % 2 === 0 ? 0.5 : 8.5),
                    y: FLOOR_Y + 1,
                    z: Math.trunc(pair / 32) * 24 + 0.5
                }
              : {
                    x: (layout.nextFloat() - 0.5) * SPREAD,
                    y: FLOOR_Y + 1,
                    z: (layout.nextFloat() - 0.5) * SPREAD
                };
        const mobs = AVOID_BLOCK_PROFILE ? AVOID_BLOCK_MIX : BRAIN_MOB_PROFILE ? BRAIN_MOB_MIX : MIX;
        const entity = runtime.spawn(BREEDING_PAIRS > 0 ? 'minecraft:sheep' : mobs[index % mobs.length]!, at);
        if (entity !== undefined && BREEDING_PAIRS > 0) breedingIds.push(entity.id);
    }

    const spawned = runtime.all().length;
    if (spawned !== count) {
        throw new Error(
            `Entity AI benchmark spawned ${spawned} of ${count} requested mobs. ` +
                'Run `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` and ' +
                '`pnpm --filter @jsprismarine/bedrock-data run datagen:java` first.'
        );
    }

    if (AVOID_BLOCK_PROFILE) {
        // Seed a nearby match for each subject so queries return the kind of candidate
        // avoid_block consumes while still scanning the full search volume.
        for (const entity of runtime.all()) {
            world.blocks.set(
                {
                    x: Math.floor(entity.position.x),
                    y: Math.floor(entity.position.y),
                    z: Math.floor(entity.position.z)
                },
                { identifier: 'minecraft:soul_fire', states: {} }
            );
        }
    }

    const sensingPairs: { readonly canSee: (mob: GoalMob) => boolean; readonly target: GoalMob }[] = [];
    if (SENSING_PROFILE) {
        const target = runtime.mobById(players[0]!.id);
        if (target === undefined) throw new Error('the benchmark could not resolve its sensing target');
        const raycast = runtime.hasLineOfSight.bind(runtime);
        runtime.hasLineOfSight = (from, to) => {
            sensingCounts.rays += 1;
            return raycast(from, to);
        };
        for (const entity of runtime.all()) {
            if (!SENSING_TYPES.has(entity.identifier)) continue;
            // Keep the direct benchmark queries inside range so they reach the ray walker.
            entity.instance.attributes.define('follow_range', { base: 32 });
            const canSee = runtime.goalWorldFor(entity.instance)?.canSee;
            if (canSee !== undefined) sensingPairs.push({ canSee, target });
        }
    }

    return {
        runtime,
        content,
        walkPlayers,
        blockReads,
        allocations,
        tagScans,
        avoidBlockResults,
        sensingCounts,
        sensingPairs,
        startBreeding: () => breedingIds.forEach((id) => runtime.setInLove(id, 400))
    };
};

/** The timing of one run: every tick's wall time, in milliseconds. */
const run = (
    count: number,
    tickCount: number,
    seed: number
): {
    readonly times: readonly number[];
    readonly measuredBlockReads: number;
    readonly measuredPlayerLists: number;
    readonly playerViewsCreated: number;
    readonly measuredTagEnumerations: number;
    readonly measuredTagMembershipChecks: number;
    readonly measuredAvoidBlockResults: number;
    readonly measuredSensingCalls: number;
    readonly measuredSensingRays: number;
} => {
    const {
        runtime,
        walkPlayers,
        blockReads,
        allocations,
        tagScans,
        avoidBlockResults,
        sensingCounts,
        sensingPairs,
        startBreeding
    } = scenario(count, seed);
    const avoidBlockSubjects = AVOID_BLOCK_PROFILE
        ? runtime
              .all()
              .filter((entity) => entity.identifier === 'minecraft:piglin' || entity.identifier === 'minecraft:hoglin')
        : [];
    const runAvoidBlockQueries = (tick: number): void => {
        if (!AVOID_BLOCK_PROFILE || tick % 5 !== 0) return;
        // #2779 keeps brain-only mobs out of Bedrock goal scheduling. Exercise the exact
        // avoid_block query shape here without reintroducing those goals into runtime ticks.
        for (const entity of avoidBlockSubjects) {
            if (
                runtime.blocks(entity.position, {
                    identifiers: ['minecraft:soul_fire'],
                    range: 8,
                    height: 4,
                    limit: 1
                }).length > 0
            ) {
                avoidBlockResults.count += 1;
            }
        }
    };
    const runSensingQueries = (): void => {
        if (!SENSING_PROFILE) return;
        for (const pair of sensingPairs) {
            for (let repeat = 0; repeat < SENSING_REPEATS; repeat += 1) {
                if (pair.canSee(pair.target)) sensingCounts.visible += 1;
                sensingCounts.calls += 1;
            }
        }
    };
    const times: number[] = [];
    for (let tick = 0; tick < WARMUP; tick += 1) {
        walkPlayers(tick);
        if (!SENSING_PROFILE) runtime.tick(tick);
        runAvoidBlockQueries(tick);
        runSensingQueries();
    }

    const readsBeforeMeasure = blockReads.count;
    const playerListsBeforeMeasure = allocations.playerLists;
    const tagEnumerationsBeforeMeasure = tagScans.enumerations;
    const tagMembershipChecksBeforeMeasure = tagScans.membershipChecks;
    const avoidBlockResultsBeforeMeasure = avoidBlockResults.count;
    const sensingCallsBeforeMeasure = sensingCounts.calls;
    const sensingRaysBeforeMeasure = sensingCounts.rays;
    startBreeding();
    for (let tick = WARMUP; tick < tickCount; tick += 1) {
        walkPlayers(tick);
        const started = performance.now();
        if (!SENSING_PROFILE) runtime.tick(tick);
        runAvoidBlockQueries(tick);
        runSensingQueries();
        times.push(performance.now() - started);
    }
    return {
        times,
        measuredBlockReads: blockReads.count - readsBeforeMeasure,
        measuredPlayerLists: allocations.playerLists - playerListsBeforeMeasure,
        playerViewsCreated: allocations.playerViews,
        measuredTagEnumerations: tagScans.enumerations - tagEnumerationsBeforeMeasure,
        measuredTagMembershipChecks: tagScans.membershipChecks - tagMembershipChecksBeforeMeasure,
        measuredAvoidBlockResults: avoidBlockResults.count - avoidBlockResultsBeforeMeasure,
        measuredSensingCalls: sensingCounts.calls - sensingCallsBeforeMeasure,
        measuredSensingRays: sensingCounts.rays - sensingRaysBeforeMeasure
    };
};

/** The value at a percentile of a sample, nearest-rank. */
const percentile = (sorted: readonly number[], fraction: number): number =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))] ?? 0;

const requestedPairs = Number.parseInt(process.env.ENTITY_AI_BREEDING_PAIRS ?? '0', 10);
const BREEDING_PAIRS = Number.isSafeInteger(requestedPairs) && requestedPairs > 0 ? requestedPairs : 0;
const COUNTS = BREEDING_PAIRS > 0 ? [BREEDING_PAIRS * 2] : process.argv.slice(2).map(Number).filter(Boolean);
const WARMUP = 200;
const MEASURED = Number(process.env.ENTITY_AI_TICKS ?? (BREEDING_PAIRS > 0 ? 40 : 1000));

const report = (count: number): void => {
    const result = run(count, WARMUP + MEASURED, 1234);
    const times = result.times;
    const sorted = [...times].sort((a, b) => a - b);
    const mean = times.reduce((sum, value) => sum + value, 0) / times.length;
    const row = [
        String(count).padStart(4),
        mean.toFixed(3).padStart(9),
        (mean / Math.max(1, count)).toFixed(4).padStart(9),
        percentile(sorted, 0.5).toFixed(3).padStart(9),
        percentile(sorted, 0.99).toFixed(3).padStart(9),
        (sorted.at(-1) ?? 0).toFixed(3).padStart(9)
    ];
    console.log(
        row.join('  ') +
            `  (${BREEDING_PAIRS > 0 ? `${BREEDING_PAIRS} breeding pairs, ` : ''}` +
            `${result.measuredBlockReads} measured block reads` +
            `${PRODUCTION_CHUNKS ? ` across ${CHUNK_COUNT} loaded chunks` : ''}` +
            `${PRODUCTION_PLAYERS ? `, ${result.measuredPlayerLists} measured player-list allocations, ${result.playerViewsCreated} cached player views` : ''}` +
            `${BRAIN_MOB_PROFILE ? `, ${result.measuredTagEnumerations} tag enumerations, ${result.measuredTagMembershipChecks} tag membership checks` : ''}` +
            `${AVOID_BLOCK_PROFILE ? `, ${result.measuredAvoidBlockResults} avoid_block query results` : ''}` +
            `${SENSING_PROFILE ? `, ${result.measuredSensingCalls} canSee calls, ${result.measuredSensingRays} rays` : ''})`
    );
};

console.log(
    [
        SENSING_PROFILE
            ? 'sensing'
            : AVOID_BLOCK_PROFILE
              ? 'avoid_block'
              : BRAIN_MOB_PROFILE
                ? 'brain mobs'
                : BREEDING_PAIRS > 0
                  ? 'breeding mobs'
                  : 'mobs',
        'mean ms/tick',
        ' ms/mob',
        '   p50 ms',
        '   p99 ms',
        '  worst ms'
    ].join('  ')
);
for (const count of COUNTS.length > 0 ? COUNTS : [1, 10, 30, 100]) report(count);
