/**
 * Benchmark: the data-driven entity runtime's cost per tick.
 *
 * Everything below the harness is real: the vanilla behavior pack is loaded
 * through the real pack stack, so a zombie here carries the goals the shipped
 * `zombie.json` declares, and the goals run against the real `EntityRuntime`,
 * the real goal world and the real path finder. Only the chunk storage is
 * replaced, by a flat stone floor with air above it.
 *
 * Run: node packages/prismarine/benchmarks/run.mjs \
 *        packages/prismarine/benchmarks/entityAi.bench.ts [mob counts...]
 */
import { writeFileSync } from 'node:fs';
import { Session } from 'node:inspector';

import type { EntityPosition } from '@jsprismarine/entities';

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
import { entityContentGroups } from '../src/entity/contentAdapter';
import { EntityRuntime } from '../src/entity/data/EntityRuntime';
import type { ContentItemEntity, EntityHostFacts, EntityWorldFacts } from '../src/entity/data/host';

/** The y the flat floor's top sits at; everything above it is air. */
const FLOOR_Y = 63;

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
const benchWorld = (random: RandomSource) => {
    const placed = new Map<string, ContentBlock>();
    const world: EntityWorldFacts = {
        level: {
            dimension: 'minecraft:overworld',
            minY: -64,
            maxY: 320,
            hasSkyLight: true,
            seaLevel: 62,
            seed: 0n,
            gameTime: () => 0,
            dayTime: () => 0,
            difficulty: () => 'normal',
            weather: () => 'clear',
            isRainingAt: () => false,
            spawnPosition: () => ({ x: 0, y: FLOOR_Y + 1, z: 0 }),
            gameRule: () => undefined
        },
        blocks: {
            get: (at) =>
                placed.get(keyOf(at)) ?? {
                    identifier: at.y > FLOOR_Y ? 'minecraft:air' : 'minecraft:stone',
                    states: {}
                },
            set: (at, block) => {
                placed.set(keyOf(at), block);
            },
            notifyNeighbors: () => undefined,
            data: () => undefined,
            setData: () => undefined,
            light: (at) => (at.y > FLOOR_Y ? 15 : 0),
            power: () => 0,
            isLoaded: () => true,
            surfaceY: () => FLOOR_Y + 1,
            biome: () => 'minecraft:plains',
            biomeTags: () => ['minecraft:plains']
        },
        effects: { playSound: () => undefined, spawnParticle: () => undefined, emitGameEvent: () => undefined },
        random
    };
    return world;
};

/** The host facts, with a player index a test can replace. */
const benchHost = (players: readonly ContentEntity[]) => {
    const lying = new Map<number, ContentItemEntity>();
    let nextItemId = 1;
    const host: EntityHostFacts = {
        players: () => players,
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
    'minecraft:pig',
    'minecraft:spider',
    'minecraft:chicken'
] as const;

/** How wide the box the mobs are spread over is, in blocks. */
const SPREAD = 64;

/** How many players walk among the mobs, which is what keeps the targeting goals live. */
const PLAYERS = 2;

/** Builds a runtime with `count` mobs standing in it, and players walking among them. */
const scenario = (count: number, seed: number) => {
    const random = seededRandom(seed);
    const world = benchWorld(random);
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
        for (const [index, player] of players.entries()) {
            const angle = tick / 40 + (index * 2 * Math.PI) / PLAYERS;
            player.position = {
                x: Math.cos(angle) * (SPREAD / 4),
                y: FLOOR_Y + 1,
                z: Math.sin(angle) * (SPREAD / 4)
            };
        }
    };
    const host = benchHost(players);

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
    content = buildServerContent({ world: singleDimension(adapter) });

    // A separate stream for the layout, so changing the mob count does not shift the
    // numbers the goals draw.
    const layout = seededRandom(seed * 7919 + 13);
    for (let index = 0; index < count; index += 1) {
        const at: EntityPosition = {
            x: (layout.nextFloat() - 0.5) * SPREAD,
            y: FLOOR_Y + 1,
            z: (layout.nextFloat() - 0.5) * SPREAD
        };
        runtime.spawn(MIX[index % MIX.length]!, at);
    }

    return { runtime, content, walkPlayers };
};

/** The timing of one run: every tick's wall time, in milliseconds. */
const run = (count: number, tickCount: number, seed: number, profile = false): number[] => {
    const { runtime, walkPlayers } = scenario(count, seed);
    const times: number[] = [];
    for (let tick = 0; tick < WARMUP; tick += 1) {
        walkPlayers(tick);
        runtime.tick(tick);
    }

    const session = profile ? startProfiler() : undefined;
    for (let tick = WARMUP; tick < tickCount; tick += 1) {
        walkPlayers(tick);
        const started = performance.now();
        runtime.tick(tick);
        times.push(performance.now() - started);
    }
    session?.();
    return times;
};

/** Starts the sampling profiler and hands back the function that writes the result out. */
const startProfiler = () => {
    const session = new Session();
    session.connect();
    session.post('Profiler.enable');
    session.post('Profiler.setSamplingInterval', { interval: 100 });
    session.post('Profiler.start');
    return () =>
        session.post('Profiler.stop', (_error, { profile: taken }) => {
            writeFileSync(process.env.ENTITY_AI_PROFILE ?? '/tmp/entityAi.cpuprofile', JSON.stringify(taken));
        });
};

/** The value at a percentile of a sample, nearest-rank. */
const percentile = (sorted: readonly number[], fraction: number): number =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))] ?? 0;

const COUNTS = process.argv.slice(2).map(Number).filter(Boolean);
const WARMUP = 200;
const MEASURED = Number(process.env.ENTITY_AI_TICKS ?? 1000);

const report = (count: number): void => {
    const times = run(count, WARMUP + MEASURED, 1234, process.env.ENTITY_AI_PROFILE !== undefined);
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
    console.log(row.join('  '));
};

console.log(['mobs', '  mean ms', ' ms/mob', '   p50 ms', '   p99 ms', '  worst ms'].join('  '));
for (const count of COUNTS.length > 0 ? COUNTS : [1, 10, 30, 100]) report(count);
