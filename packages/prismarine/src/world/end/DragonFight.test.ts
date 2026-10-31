import fs, { readFileSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';

import { BlockPalette, vanillaBlockPalette } from '@jsprismarine/blocks';
import { Vector3 } from '@jsprismarine/math';
import { vanillaItemDefinitions } from '@jsprismarine/items';
import { OVERWORLD_STEM_ID } from '@jsprismarine/worldgen';
import BossEventPacket, { BossBarColor, BossEventUpdateType } from '@jsprismarine/protocol/packet/BossEventPacket';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { definitionOf, definitionsOf } from '../../content/ContentOptions';
import { overlayPackPath } from '../../content/packStack';
import { buildServerContent } from '../../content/ServerContent';
import type { ServerContent } from '../../content/ServerContent';
import { serverWorldSource } from '../../content/world/serverSource';
import type { ServerWorldHandle } from '../../content/world/serverSource';
import type { DataEntity } from '../../entity/data/DataEntity';
import { EntityRuntimes } from '../../entity/data/live';
import type { LiveEntityRuntime } from '../../entity/data/live';
import type Player from '../../Player';
import type Server from '../../Server';
import type { Config } from '../../config/Config';
import { Difficulty } from '@jsprismarine/minecraft';
import { testEntityServer } from '../../testing/entityServer';
import { fakePlayer } from '../../testing/fakePlayer.test.helper';
import { TEST_GENERATOR_KIND, TEST_OVERWORLD_STEM, fakeLevel } from '../../testing/level';
import { stub } from '../../testing/stub.test.helper';
import { GeneratorFactories } from '../GeneratorFactories';
import { Level } from '../Level';
import type { DimensionTravel } from '../portal/DimensionTravel';
import LevelDB from '../providers/leveldb/LevelDB';
import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import BlockUpdateScheduler from '../BlockUpdateScheduler';
import Chunk from '../chunk/Chunk';
import { Dimensions } from '../Dimension';
import EntityGrid from '../EntityGrid';
import { createEngineWorld } from '../EngineWorld';
import type { Generator } from '../Generator';
import { Position } from '../Position';
import { World } from '../World';
import { NULL_WORLD_CHANGE_SINK } from '../WorldChangeSink';
import { WorldSystems } from '../WorldSystems';
import type WorldManager from '../WorldManager';
import type { DragonFightState } from '../WorldPersistence';
import { DragonFight } from './DragonFight';

/**
 * The fight over a live End world: real chunks, a real `World` on the prototype, the real
 * content build with the dragon and crystal trimmed to what the fight reads, and fake players
 * whose connections capture packets. Modeled on `entity/data/live.test.ts`.
 */

const END = Dimensions.TheEnd;

/** The y the end stone floor's top sits at. The podium search steps down to it from above. */
const FLOOR_Y = 64;

/** How far out, in chunks, the fixture loads ground. */
const LOADED_RADIUS = 2;

const BLOCKS = [
    'minecraft:air',
    'minecraft:end_stone',
    'minecraft:bedrock',
    'minecraft:torch',
    'minecraft:end_portal'
] as const;

/** One block definition, read from the overlay the server itself loads. */
const overlayBlock = (identifier: string) => {
    const file = join(overlayPackPath(), 'blocks', `${identifier.slice('minecraft:'.length)}.block.json`);
    return definitionOf('blocks', identifier, JSON.parse(readFileSync(file, 'utf8')));
};

/** A palette of exactly the fixture's blocks, with each one's real Bedrock states. */
const fixturePalette = (): BlockPalette =>
    new BlockPalette(BLOCKS.map((identifier) => [identifier, vanillaBlockPalette().entry(identifier)!.model]));

/** One entity file, in the shape a behavior pack writes. */
const entityFile = (identifier: string, body: Record<string, unknown>) =>
    definitionOf('entities', identifier, {
        format_version: '1.21.0',
        'minecraft:entity': {
            description: { identifier, is_spawnable: true, is_summonable: true },
            ...body
        }
    });

/** The dragon and the crystal, trimmed to the components the fight reads. */
const ENTITIES = new Map([
    [
        'minecraft:ender_dragon',
        entityFile('minecraft:ender_dragon', {
            components: {
                'minecraft:health': { value: 200, max: 200 },
                'minecraft:collision_box': { width: 13, height: 4 },
                'minecraft:physics': { has_gravity: false, has_collision: false },
                'minecraft:type_family': { family: ['dragon', 'monster', 'mob'] }
            }
        })
    ],
    [
        'minecraft:ender_crystal',
        entityFile('minecraft:ender_crystal', {
            components: {
                'minecraft:health': { value: 1, max: 1 },
                'minecraft:collision_box': { width: 2, height: 2 },
                'minecraft:physics': {}
            }
        })
    ]
]);

const idOf = (identifier: string): number => {
    const runtimeId = BlockRuntimeIds.tryGetByState(identifier, {});
    if (runtimeId === null) throw new Error(`no ${identifier} in this server's catalog`);
    return runtimeId;
};

/** One End chunk of flat end stone, with its top at {@link FLOOR_Y}. */
const endChunk = (x: number, z: number): Chunk => {
    const chunk = new Chunk(x, z, new Map(), END);
    const endStone = idOf('minecraft:end_stone');
    for (let bx = 0; bx < 16; bx += 1)
        for (let bz = 0; bz < 16; bz += 1) chunk.fillColumn(bx, bz, 60, FLOOR_Y, endStone);
    return chunk;
};

/** A `World` reduced to what the fight touches, built on the real prototype over real chunks. */
const liveEndWorld = (): {
    world: World;
    players: Map<bigint, Player>;
    runtimes: EntityRuntimes;
    hold(content: ServerContent): void;
} => {
    let content: ServerContent | undefined;
    const chunks = new Map<number, Chunk>();
    for (let x = -LOADED_RADIUS; x <= LOADED_RADIUS; x += 1)
        for (let z = -LOADED_RADIUS; z <= LOADED_RADIUS; z += 1) chunks.set(Chunk.packXZ(x, z), endChunk(x, z));

    const players = new Map<bigint, Player>();
    const runtimes = new EntityRuntimes();
    const server: Server = Object.assign(
        stub<Server>({
            post: () => 0,
            getTick: () => 0,
            getRandom: () => () => 0.5,
            getLogger: () =>
                stub<ReturnType<Server['getLogger']>>({
                    debug: () => {},
                    info: () => {},
                    warn: () => {},
                    error: () => {},
                    verbose: () => {}
                })
        }),
        {
            getConfig: () =>
                stub<Config>({ getDifficulty: () => Difficulty.NORMAL, getEntityTrackingInterval: () => 20 }),
            getEntityRuntime: (dimension: string) => runtimes.at(dimension),
            getWorldManager: () =>
                stub<WorldManager>({
                    getDefaultWorld: () => world,
                    getWorldByDimension: (dimension) => (dimension === END.id ? world : undefined)
                }),
            getContent: () => content
        }
    );

    const world: World = Object.assign(Object.create(World.prototype), {
        chunks,
        loading: new Map(),
        level: fakeLevel({ server, seed: 1234n, spawn: new Vector3(0, FLOOR_Y + 1, 0) }),
        dimension: END,
        generator: stub<Generator>({}),
        blockUpdates: new BlockUpdateScheduler(),
        entities: new Map(),
        entityChunkIndices: new Map(),
        entityGrid: new EntityGrid(),
        players,
        server
    });

    world.attachChangeSink(NULL_WORLD_CHANGE_SINK);
    Object.assign(world, {
        systems: new WorldSystems({
            view: {
                dimension: END,
                blockAt: (x: number, y: number, z: number) => world.loadedBlockAt(x, y, z),
                loadedChunks: () => [...chunks.values()].map((chunk) => ({ x: chunk.getX(), z: chunk.getZ() }))
            },
            world: createEngineWorld(world)
        })
    });

    return {
        world,
        players,
        runtimes,
        hold: (built) => {
            content = built;
        }
    };
};

/** Builds the content over the live world, the way `Server.enableContent` does. */
const buildOver = (world: World, runtimes: EntityRuntimes): { source: ServerWorldHandle; content: ServerContent } => {
    let built: ServerContent | undefined;
    const worldSource = serverWorldSource({
        worldFor: () => world,
        content: () => built!,
        seed: 1234n,
        difficulty: () => Difficulty.NORMAL,
        entityRuntimes: runtimes
    });
    built = buildServerContent({
        load: () => ({
            definitions: definitionsOf({
                blocks: new Map(BLOCKS.map((id) => [id, overlayBlock(id)])),
                entities: ENTITIES
            }),
            diagnostics: []
        }),
        blockPalette: fixturePalette(),
        itemDefinitions: vanillaItemDefinitions().filter((definition) =>
            ['minecraft:stick'].includes(definition.identifier)
        ),
        seed: 1234n,
        world: worldSource
    });
    return { source: worldSource, content: built };
};

/** A connected player standing in the End world, with its captured packets. */
const enterArena = (world: World, players: Map<bigint, Player>, x: number, y: number, z: number) => {
    const fixture = fakePlayer();
    Object.assign(fixture.player, { position: new Position(x, y, z, world) });
    players.set(fixture.player.getRuntimeId(), fixture.player);
    return fixture;
};

const bossEvents = (sent: unknown[]): BossEventPacket[] =>
    sent.filter((packet): packet is BossEventPacket => packet instanceof BossEventPacket);

const blockNameAt = (world: World, x: number, y: number, z: number): string | undefined =>
    world.loadedBlockAt(x, y, z)?.name;

describe('the dragon fight over a live End world', () => {
    let world: World;
    let players: Map<bigint, Player>;
    let live: LiveEntityRuntime;

    beforeEach(() => {
        const built = liveEndWorld();
        world = built.world;
        players = built.players;
        const { source, content } = buildOver(world, built.runtimes);
        built.hold(content);
        source.at(END.name);
        const opened = built.runtimes.at(END.name);
        if (opened === undefined) throw new Error('the content world opened no End entity runtime');
        live = opened;
    });

    const freshFight = (state?: DragonFightState): DragonFight => new DragonFight(world, state, world.getSeed());

    const run = async (fight: DragonFight, ticks: number): Promise<void> => {
        for (let tick = 0; tick < ticks; tick += 1) await fight.tick();
    };

    const dragons = (): DataEntity[] =>
        live.runtime.all().filter((entity) => entity.identifier === 'minecraft:ender_dragon');

    /** A state the way a save after a first kill holds it. */
    const killedState = (): DragonFightState => ({
        dragonKilled: true,
        previouslyKilled: true,
        needsStateScanning: false,
        exitPortalLocation: { x: 0, y: FLOOR_Y, z: 0 },
        gateways: [4, 2, 9],
        respawnTime: 0,
        respawnCrystalIds: []
    });

    describe('scanning', () => {
        it('scans once on the first populated tick: the inactive podium appears and is recorded', async () => {
            enterArena(world, players, 0, 70, 0);
            const fight = freshFight();

            await run(fight, 1);

            // The four-high bedrock pillar, Java's `EndPodiumFeature` above the origin.
            for (let dy = 0; dy < 4; dy += 1) expect(blockNameAt(world, 0, FLOOR_Y + dy, 0)).toBe('minecraft:bedrock');
            // The rim's cardinal cells, and an inactive (air, not portal) ring inside them.
            for (const [x, z] of [
                [3, 0],
                [-3, 0],
                [0, 3],
                [0, -3]
            ] as const) {
                expect(blockNameAt(world, x, FLOOR_Y, z)).toBe('minecraft:bedrock');
            }
            expect(blockNameAt(world, 1, FLOOR_Y, 0)).toBe('minecraft:air');
            // The four wall torches on the pillar, Bedrock's one torch block.
            expect(blockNameAt(world, 1, FLOOR_Y + 2, 0)).toBe('minecraft:torch');
            expect(blockNameAt(world, -1, FLOOR_Y + 2, 0)).toBe('minecraft:torch');

            expect(fight.state().exitPortalLocation).toEqual({ x: 0, y: FLOOR_Y, z: 0 });
            expect(fight.state().needsStateScanning).toBe(false);
            expect(fight.state().previouslyKilled).toBe(false);
        });

        it('adopts an existing podium instead of placing one, reading its activity', async () => {
            enterArena(world, players, 0, 70, 0);
            const first = freshFight();
            await run(first, 1);
            // Activate the ring by hand, as a dragon death will in a later slice, and let go
            // of the dragon the first fight spawned, as a restart with unloaded chunks does.
            world.setLoadedBlockRuntimeId(1, FLOOR_Y, 0, idOf('minecraft:end_portal'));
            live.runtime.remove(dragons()[0]!.id, 'chunk unload');

            const rescanned = freshFight();
            await run(rescanned, 1);

            expect(rescanned.state().exitPortalLocation).toEqual({ x: 0, y: FLOOR_Y, z: 0 });
            expect(rescanned.state().previouslyKilled).toBe(true);
            expect(rescanned.state().dragonKilled).toBe(true);
            expect(dragons()).toHaveLength(0);
        });

        it('does not rescan a saved state', async () => {
            enterArena(world, players, 0, 70, 0);
            const fight = freshFight({ ...killedState(), dragonKilled: true });

            await run(fight, 25);

            expect(blockNameAt(world, 0, FLOOR_Y, 0)).toBe('minecraft:end_stone');
        });

        it('waits for a player: an empty arena is never scanned', async () => {
            const fight = freshFight();

            await run(fight, 40);

            expect(fight.state().needsStateScanning).toBe(true);
            expect(blockNameAt(world, 0, FLOOR_Y, 0)).toBe('minecraft:end_stone');
        });
    });

    describe('the dragon', () => {
        it('spawns one dragon at (0, 128, 0) on a fresh fight and keeps its reference', async () => {
            enterArena(world, players, 0, 70, 0);
            const fight = freshFight();

            await run(fight, 40);

            const spawned = dragons();
            expect(spawned).toHaveLength(1);
            expect(spawned[0]!.position).toMatchObject({ x: 0, y: 128, z: 0 });
            expect(fight.state().dragonUniqueId).toBe(spawned[0]!.persistentIdentity);
            expect(fight.state().dragonKilled).toBe(false);
        });

        it('does not respawn the dragon of a killed-and-saved fight', async () => {
            enterArena(world, players, 0, 70, 0);
            const fight = freshFight(killedState());

            await run(fight, 40);

            expect(dragons()).toHaveLength(0);
        });

        it('learns of the dragon dying through the removal hook and goes killed', async () => {
            const { sent } = enterArena(world, players, 0, 70, 0);
            const fight = freshFight();
            await run(fight, 1);
            const dragon = dragons()[0]!;

            live.runtime.remove(dragon.id, 'death');
            await run(fight, 40);

            expect(fight.state().dragonKilled).toBe(true);
            expect(fight.state().previouslyKilled).toBe(true);
            expect(fight.state().dragonUniqueId).toBeUndefined();
            expect(dragons()).toHaveLength(0);
            const events = bossEvents(sent).map((event) => event.eventType);
            expect(events.at(-1)).toBe(BossEventUpdateType.Remove);
        });

        it('heals one point per ten ticks while a crystal is within 32 blocks', async () => {
            enterArena(world, players, 0, 70, 0);
            const fight = freshFight();
            await run(fight, 1);
            const dragon = dragons()[0]!;
            dragon.instance.attributes.set('health', 100);
            live.runtime.spawn('minecraft:ender_crystal', { x: 0.5, y: 129, z: 0.5 });

            await run(fight, 20);

            expect(dragon.instance.attributes.get('health')?.current).toBe(102);
        });

        it('does not heal from a crystal further than 32 blocks away', async () => {
            enterArena(world, players, 0, 70, 0);
            const fight = freshFight();
            await run(fight, 1);
            const dragon = dragons()[0]!;
            dragon.instance.attributes.set('health', 100);
            live.runtime.spawn('minecraft:ender_crystal', { x: 30.5, y: 70, z: 20.5 });

            await run(fight, 20);

            expect(dragon.instance.attributes.get('health')?.current).toBe(100);
        });
    });

    describe('the boss bar', () => {
        it('shows a pink dragon bar to a player in the arena and its percent follows the health', async () => {
            const near = enterArena(world, players, 0, 70, 0);
            const fight = freshFight();

            await run(fight, 1);

            const added = bossEvents(near.sent);
            expect(added.map((event) => event.eventType)).toContain(BossEventUpdateType.Add);
            const add = added.find((event) => event.eventType === BossEventUpdateType.Add)!;
            expect(add.name).toBe('entity.minecraft.ender_dragon');
            expect(add.color).toBe(BossBarColor.Pink);

            const dragon = dragons()[0]!;
            dragon.instance.attributes.set('health', 50);
            near.sent.length = 0;
            await run(fight, 1);

            const update = bossEvents(near.sent).find((event) => event.eventType === BossEventUpdateType.UpdatePercent);
            expect(update?.healthPercent).toBe(0.25);
        });

        it('never shows the bar to a player outside the 192 radius', async () => {
            const near = enterArena(world, players, 0, 70, 0);
            const far = enterArena(world, players, 400, 70, 0);
            const fight = freshFight();

            await run(fight, 25);

            expect(bossEvents(near.sent).some((event) => event.eventType === BossEventUpdateType.Add)).toBe(true);
            expect(bossEvents(far.sent)).toHaveLength(0);
        });

        it('adds a player entering the End mid-fight and removes one leaving it', async () => {
            enterArena(world, players, 0, 70, 0);
            const fight = freshFight();
            await run(fight, 5);

            const arriving = enterArena(world, players, 10, 70, 10);
            await run(fight, 20);
            expect(bossEvents(arriving.sent).map((event) => event.eventType)).toContain(BossEventUpdateType.Add);

            // Leaving the End: the travel path takes the player out of this world's roster.
            players.delete(arriving.player.getRuntimeId());
            arriving.sent.length = 0;
            await run(fight, 20);
            expect(bossEvents(arriving.sent).map((event) => event.eventType)).toContain(BossEventUpdateType.Remove);
        });

        it('shows no bar while the fight is saved as killed', async () => {
            const near = enterArena(world, players, 0, 70, 0);
            const fight = freshFight(killedState());

            await run(fight, 25);

            expect(bossEvents(near.sent)).toHaveLength(0);
        });
    });

    describe('gateways', () => {
        it('shuffles the twenty gateway indices once, stable for a pinned seed', () => {
            const first = freshFight().state().gateways;

            // One of each index: the list is a permutation of 0..19.
            expect([...first].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, index) => index));
            // Pinned once from this shuffle at seed 1234: Java's `Util.shuffle` swap order over
            // the 48-bit LCG, the same derivation `endSpikesForSeed` pins in its own test.
            expect(first).toEqual([1, 6, 11, 14, 4, 18, 12, 2, 17, 0, 16, 15, 7, 9, 3, 13, 10, 5, 19, 8]);
        });

        it('keeps a saved gateway list instead of reshuffling it', () => {
            const fight = freshFight(killedState());

            expect(fight.state().gateways).toEqual([4, 2, 9]);
        });
    });
});

describe('fight persistence through a real level over LevelDB', () => {
    let scratch: string;

    beforeEach(() => {
        scratch = fs.mkdtempSync(join(os.tmpdir(), 'jsp-dragon-fight-'));
    });

    afterEach(() => {
        fs.rmSync(scratch, { recursive: true, force: true });
    });

    const testServer = (): Server =>
        Object.assign(testEntityServer(), {
            getConfig: () =>
                stub<Config>({
                    getPreloadRadius: () => 0,
                    getDifficulty: () => Difficulty.NORMAL,
                    getEntityTrackingInterval: () => 20
                }),
            getDimensionTravel: () => stub<DimensionTravel>({ touch: async () => {} })
        });

    /** A provider with a stub world behind it, for reading and seeding the record directly. */
    const rawProvider = (): LevelDB => {
        const server = testServer();
        const provider = new LevelDB(scratch, server);
        provider.setWorld(
            stub<World>({
                getName: () => 'fight',
                getSeed: () => 1234n,
                getDimension: () => Dimensions.Overworld,
                getEntities: () => [],
                getServer: () => server
            })
        );
        return provider;
    };

    const makeLevel = (server: Server): Level =>
        new Level({
            name: 'fight',
            path: scratch,
            server,
            provider: new LevelDB(scratch, server),
            seed: 1234n,
            stems: new Map([
                [OVERWORLD_STEM_ID, TEST_OVERWORLD_STEM],
                [END.id, { type: END.id, generator: { type: TEST_GENERATOR_KIND, settings: undefined } }]
            ]),
            dimensionTypes: new Map([
                [Dimensions.Overworld.id, Dimensions.Overworld.java],
                [END.id, END.java]
            ]),
            factories: new GeneratorFactories([
                { kind: TEST_GENERATOR_KIND, build: () => ({ generateChunk: async (x, z) => endChunk(x, z) }) }
            ]),
            worldgen: () => {
                throw new Error('this level never reads the Java registries');
            }
        });

    const savedFight = (): DragonFightState => ({
        dragonKilled: true,
        previouslyKilled: true,
        needsStateScanning: false,
        dragonUniqueId: '9f4a1c2e-3b5d-4e6f-8a7b-0c1d2e3f4a5b',
        exitPortalLocation: { x: 0, y: FLOOR_Y, z: 0 },
        gateways: [17, 3, 0],
        respawnTime: 0,
        respawnCrystalIds: []
    });

    it('restores the saved fight into the End world and writes it back on save', async () => {
        const seeded = rawProvider();
        await seeded.enable();
        await seeded.writeWorldData({ dragonFight: savedFight() });
        await seeded.disable();

        const level = makeLevel(testServer());
        level.setSpawn(new Vector3(0, FLOOR_Y + 1, 0));
        await level.enable();
        try {
            const world = await level.world(END.id);

            // The world's own tick creates and drives the fight; nothing asked for it yet.
            expect(world.dragonFightSaveState()).toBeUndefined();
            await level.update(1);
            expect(world.dragonFightSaveState()).toEqual(savedFight());
            expect(world.getDragonFight()?.state()).toEqual(savedFight());

            await level.saveLevelData();
        } finally {
            await level.disable();
        }

        const reopened = rawProvider();
        await reopened.enable();
        expect((await reopened.readWorldData())?.dragonFight).toEqual(savedFight());
        await reopened.disable();
    });

    it('creates no fight for a dimension without one and keeps the stored record on save', async () => {
        const seeded = rawProvider();
        await seeded.enable();
        await seeded.writeWorldData({ dragonFight: savedFight() });
        await seeded.disable();

        const level = makeLevel(testServer());
        level.setSpawn(new Vector3(0, FLOOR_Y + 1, 0));
        await level.enable();
        try {
            const overworld = await level.world(Dimensions.Overworld.id);
            expect(overworld.getDragonFight()).toBeUndefined();

            await level.saveLevelData();
        } finally {
            await level.disable();
        }

        const reopened = rawProvider();
        await reopened.enable();
        expect((await reopened.readWorldData())?.dragonFight).toEqual(savedFight());
        await reopened.disable();
    });
});
