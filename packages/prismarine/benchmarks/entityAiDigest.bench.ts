/**
 * A behavior digest of the data-driven entity runtime.
 *
 * The benchmark beside this one says how fast the runtime is. This says
 * whether it still does the same thing: five seeded scenarios are driven for a
 * thousand ticks each and every mob's position, heading, target and running
 * goals are folded into a SHA-256. Two builds that agree on the digest agree
 * on every mob's behavior, bit for bit, so an optimization that changed which
 * mob a goal picked would show up here as a different hash.
 *
 * Run: node packages/prismarine/benchmarks/run.mjs \
 *        packages/prismarine/benchmarks/entityAiDigest.bench.ts [scenario names...]
 */
import { createHash } from 'node:crypto';

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

const FLOOR_Y = 63;

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

const keyOf = (at: ContentPosition): string => `${at.x},${at.y},${at.z}`;

const digestWorld = (random: RandomSource, sounds: string[]) => {
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
        effects: {
            playSound: (_at, sound) => sounds.push(sound),
            spawnParticle: () => undefined,
            emitGameEvent: () => undefined
        },
        random
    };
    return world;
};

const digestHost = (players: readonly ContentEntity[], drops: string[]) => {
    const lying = new Map<number, ContentItemEntity>();
    let nextItemId = 1;
    const host: EntityHostFacts = {
        players: () => players,
        drop: (position, item: ContentItemDrop) => {
            drops.push(`${item.identifier}x${item.count}@${keyOf(position)}`);
            lying.set(nextItemId, { id: nextItemId, position, item });
            nextItemId += 1;
        },
        items: () => [...lying.values()],
        takeItem: (id) => {
            const found = lying.get(id);
            lying.delete(id);
            return found?.item;
        },
        hurt: (id, amount, cause) => drops.push(`hurt:${id}:${amount}:${cause}`),
        mobEventActive: () => false
    };
    return host;
};

const ticks: ContentTickScheduler = { schedule: () => undefined, isScheduled: () => false, runsThisTick: () => false };

/** One scenario: a mob mix, a spread and a seed. */
interface Scenario {
    readonly name: string;
    readonly mobs: readonly string[];
    readonly count: number;
    readonly spread: number;
    readonly players: number;
    readonly seed: number;
    readonly ticks: number;
}

/**
 * The five scenarios, chosen to cover the goals that read the neighbor scan.
 *
 * Two hostile scenes where `nearest_attackable_target` picks a victim out of
 * `mobs()`, one farm where `breed` and `follow_parent` do, one crowd dense
 * enough that many mobs sit at the same distance from each other, which is
 * where a sort that is not stable would diverge, and one sparse scene.
 */
const SCENARIOS: readonly Scenario[] = [
    {
        name: 'hostile',
        mobs: ['minecraft:zombie', 'minecraft:skeleton', 'minecraft:creeper', 'minecraft:spider'],
        count: 60,
        spread: 48,
        players: 2,
        seed: 11,
        ticks: 1000
    },
    {
        name: 'farm',
        mobs: ['minecraft:cow', 'minecraft:sheep', 'minecraft:pig', 'minecraft:chicken'],
        count: 60,
        spread: 32,
        players: 1,
        seed: 22,
        ticks: 1000
    },
    {
        name: 'mixed',
        mobs: [
            'minecraft:zombie',
            'minecraft:cow',
            'minecraft:skeleton',
            'minecraft:sheep',
            'minecraft:creeper',
            'minecraft:pig',
            'minecraft:spider',
            'minecraft:chicken'
        ],
        count: 100,
        spread: 64,
        players: 2,
        seed: 1234,
        ticks: 1000
    },
    {
        // Every mob on one block, so every pair is at distance zero and the
        // order `mobs()` returns is decided entirely by the sort's stability.
        name: 'stacked',
        mobs: ['minecraft:zombie', 'minecraft:cow', 'minecraft:sheep'],
        count: 24,
        spread: 0,
        players: 1,
        seed: 33,
        ticks: 400
    },
    {
        name: 'sparse',
        mobs: ['minecraft:zombie', 'minecraft:cow', 'minecraft:villager_v2'],
        count: 20,
        spread: 192,
        players: 3,
        seed: 44,
        ticks: 120
    }
];

/** One number's exact bits, so a digest catches a change below printed precision. */
const bits = (value: number): string => {
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, value);
    return view.getBigUint64(0).toString(16);
};

const digestOf = (scenario: Scenario, content: ServerContent | undefined): string => {
    const hash = createHash('sha256');
    const sounds: string[] = [];
    const drops: string[] = [];
    const random = seededRandom(scenario.seed);
    const world = digestWorld(random, sounds);
    const players: ContentEntity[] = Array.from({ length: scenario.players }, (_unused, index) => ({
        id: 100_000 + index,
        identifier: 'minecraft:player',
        position: { x: 0, y: FLOOR_Y + 1, z: 0 }
    }));
    const host = digestHost(players, drops);

    let built: ServerContent | undefined = content;
    const runtime = new EntityRuntime({
        content: () => {
            if (built === undefined) throw new Error('the runtime was read before the content was built');
            return built;
        },
        world,
        host,
        report: (message) => hash.update(`report ${message}\n`)
    });

    const adapter: ServerWorldAdapter = { ...world, ticks, ...entityContentGroups(runtime) };
    built = buildServerContent({ world: singleDimension(adapter) });

    const layout = seededRandom(scenario.seed * 7919 + 13);
    for (let index = 0; index < scenario.count; index += 1) {
        const at: EntityPosition = {
            x: (layout.nextFloat() - 0.5) * scenario.spread,
            y: FLOOR_Y + 1,
            z: (layout.nextFloat() - 0.5) * scenario.spread
        };
        runtime.spawn(scenario.mobs[index % scenario.mobs.length]!, at);
    }

    for (let tick = 0; tick < scenario.ticks; tick += 1) {
        for (const [index, player] of players.entries()) {
            const angle = tick / 40 + (index * 2 * Math.PI) / Math.max(1, scenario.players);
            player.position = {
                x: Math.cos(angle) * (scenario.spread / 4 + 4),
                y: FLOOR_Y + 1,
                z: Math.sin(angle) * (scenario.spread / 4 + 4)
            };
        }
        runtime.tick(tick);

        for (const entity of runtime.all()) {
            hash.update(
                [
                    tick,
                    entity.id,
                    entity.identifier,
                    bits(entity.position.x),
                    bits(entity.position.y),
                    bits(entity.position.z),
                    bits(entity.body.yaw),
                    bits(entity.body.pitch),
                    entity.target ?? '-',
                    entity.body.carried ?? '-',
                    entity.body.sitting ? 's' : '-',
                    entity.body.sleeping ? 'z' : '-',
                    entity.body.loveTicks,
                    entity.instance.goals.runningGoals().join(','),
                    entity.instance.attributes.get('health')?.current ?? '-'
                ].join('|') + '\n'
            );
        }
    }

    hash.update(`sounds ${sounds.join(',')}\n`);
    hash.update(`drops ${drops.join(',')}\n`);
    return hash.digest('hex');
};

const only = process.argv.slice(2);
for (const scenario of SCENARIOS.filter((entry) => only.length === 0 || only.includes(entry.name))) {
    const started = performance.now();
    const digest = digestOf(scenario, undefined);
    console.log(`${scenario.name.padEnd(10)} ${digest}  ${((performance.now() - started) / 1000).toFixed(1)}s`);
}
