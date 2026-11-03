/**
 * A behavior digest of the data-driven entity runtime.
 *
 * The benchmark beside this one says how fast the runtime is. This says
 * whether it still does the same thing: seeded scenarios are driven for a
 * thousand ticks each and every mob's position, heading, target and running
 * goals are folded into a SHA-256. Two builds that agree on the digest agree
 * on every mob's behavior, bit for bit, so an optimization that changed which
 * mob a goal picked would show up here as a different hash. The brain-mix
 * scene runs every brain mob twice while its behaviors and memories change.
 *
 * Run: node packages/prismarine/benchmarks/run.mjs \
 *        packages/prismarine/benchmarks/entityAiDigest.bench.ts [scenario names...] [--verify-replay]
 *
 * `--verify-replay` runs each selected in-process scenario a second time and
 * compares every tick's entity state and recorded effects. This checks the
 * existing synthetic runtime workload; it does not capture live server packets.
 */
import { createHash } from 'node:crypto';

import type { EntityPosition } from '@jsprismarine/entities';
import { BRAIN_MOBS } from '@jsprismarine/entity-brains';
import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';

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
import { firstDivergentTick } from './entityAiReplay';

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
    const chunkIdentities = new Map<string, object>();
    const chunkRevisions = new Map<string, number>();
    let blockRevision = 0;
    const chunkKeyAt = (at: ContentPosition): string => `${at.x >> 4},${at.z >> 4}`;
    const chunkIdentityAt = (at: ContentPosition): object => {
        const key = chunkKeyAt(at);
        let identity = chunkIdentities.get(key);
        if (identity === undefined) {
            identity = {};
            chunkIdentities.set(key, identity);
        }
        return identity;
    };
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
                const key = chunkKeyAt(at);
                chunkRevisions.set(key, (chunkRevisions.get(key) ?? 0) + 1);
                blockRevision += 1;
            },
            blockRevision: () => blockRevision,
            blockChunkIdentityAt: chunkIdentityAt,
            blockChunkRevisionAt: (at) => chunkRevisions.get(chunkKeyAt(at)) ?? 0,
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
    readonly extras?: readonly { readonly identifier: string; readonly position: EntityPosition }[];
}

/** Bedrock identifiers for the twenty Java brain definitions, including renamed mobs. */
const brainMobIdentifiers = BRAIN_MOBS.map(({ id }) => {
    const mapped = javaEntityTypeToBedrock(id);
    return mapped.kind === 'mapped' ? mapped.bedrock : id;
});

/**
 * The five goal scenarios cover behaviors that read the neighbor scan.
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
    },
    {
        // Every registered brain mob appears twice, so the context caches cover every brain
        // implementation while the dense neighborhood exercises the live entity views.
        name: 'brain-mix',
        mobs: brainMobIdentifiers,
        count: 40,
        spread: 48,
        players: 4,
        seed: 55,
        ticks: 300
    },
    {
        name: 'collision-base',
        mobs: ['minecraft:cow'],
        count: 48,
        spread: 8,
        players: 0,
        seed: 66,
        ticks: 120
    },
    {
        name: 'collision-dragon',
        mobs: ['minecraft:cow'],
        count: 48,
        spread: 8,
        players: 0,
        seed: 66,
        ticks: 120,
        extras: [{ identifier: 'minecraft:ender_dragon', position: { x: 0, y: FLOOR_Y + 1, z: 0 } }]
    }
];

/** Reviewed behavior baselines; the brain-mix digest also locks live entity references in memories. */
const EXPECTED_DIGESTS: Readonly<Partial<Record<string, string>>> = {
    hostile: 'ac6e4551cd5974484d44d06c22a5189c66a77297391710cff2549b038c3a7d95',
    farm: '06ce634e1500f6f52a238a0bcb352eaf8edb4d904090570ddc541d836dde699e',
    mixed: '86d28a23d6324db532c95e9271b7524a940cff78b0026f4d06ddb8d0fc2ac614',
    stacked: '61ecca73ee3d869c94612b3cd2a411e14ab702cda7bc578d04624122ccbf0a7b',
    sparse: '29aa8215bd262c183f42147a7cdc299fede76de05bbe2859721f7e9e8bdb3300',
    'brain-mix': '49887ee656cee995cbc8735eb2b1f5479a1dfffb2d78c0207b8947a4ba8c9e5d',
    'collision-base': '66d70b851f3a72b4480074745e3545e084062bc8cfa61b6ba00850a965de0e9e',
    'collision-dragon': '236beabb21c88d410c33a64b50cbefe1aa85f47af64c3d56e06ad7e2445ff05c'
};

/** One number's exact bits, so a digest catches a change below printed precision. */
const bits = (value: number): string => {
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, value);
    return view.getBigUint64(0).toString(16);
};

const digestOf = (
    scenario: Scenario,
    content: ServerContent | undefined
): { readonly outputDigest: string; readonly tickDigests: readonly string[] } => {
    const hash = createHash('sha256');
    const sounds: string[] = [];
    const drops: string[] = [];
    const tickDigests: string[] = [];
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
    for (const extra of scenario.extras ?? []) runtime.spawn(extra.identifier, extra.position);

    let recordedSounds = 0;
    let recordedDrops = 0;
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

        // Keep the old whole-run digest and also hash each tick separately, so a replay check
        // can name the first state where the same seeded workload diverged.
        const tickHash = createHash('sha256');
        for (const entity of runtime.all()) {
            const state =
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
                ].join('|') + '\n';
            hash.update(state);
            tickHash.update(state);
        }

        tickHash.update(`sounds ${sounds.slice(recordedSounds).join(',')}\n`);
        tickHash.update(`drops ${drops.slice(recordedDrops).join(',')}\n`);
        recordedSounds = sounds.length;
        recordedDrops = drops.length;
        tickDigests.push(tickHash.digest('hex'));
    }

    hash.update(`sounds ${sounds.join(',')}\n`);
    hash.update(`drops ${drops.join(',')}\n`);
    return { outputDigest: hash.digest('hex'), tickDigests };
};

const args = process.argv.slice(2);
const verifyReplay = args.includes('--verify-replay');
const only = args.filter((argument) => argument !== '--verify-replay');
const selected = SCENARIOS.filter((entry) => only.length === 0 || only.includes(entry.name));

for (const scenario of selected) {
    const started = performance.now();
    const original = digestOf(scenario, undefined);
    const expected = EXPECTED_DIGESTS[scenario.name];
    // The added collision cases measure query cost; only reviewed behavior baselines gate equality.
    if (expected !== undefined && original.outputDigest !== expected) {
        throw new Error(
            `${scenario.name} entity AI digest changed: expected ${expected}, got ${original.outputDigest}`
        );
    }
    let replaySummary = '';

    if (verifyReplay) {
        const replay = digestOf(scenario, undefined);
        const divergentTick = firstDivergentTick(original.tickDigests, replay.tickDigests);

        if (divergentTick !== undefined) {
            throw new Error(`${scenario.name} replay diverged at tick ${divergentTick}`);
        }
        if (original.outputDigest !== replay.outputDigest) {
            throw new Error(`${scenario.name} replay changed the final output digest without a tick divergence`);
        }
        replaySummary = `  replay matched ${original.tickDigests.length} tick digests`;
    }

    console.log(
        `${scenario.name.padEnd(10)} ${original.outputDigest}  ${((performance.now() - started) / 1000).toFixed(1)}s${replaySummary}`
    );
}
