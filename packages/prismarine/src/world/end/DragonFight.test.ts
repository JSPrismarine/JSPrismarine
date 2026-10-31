import fs, { readFileSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';

import { BlockPalette, vanillaBlockPalette } from '@jsprismarine/blocks';
import { endSpikesForSeed } from '@jsprismarine/features';
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
import { AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';
import { portalRuleOf } from '../portal/rules';
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

/**
 * The chunks under the two gateways the death tests pin: index 8, the last of seed 1234's
 * shuffle, lands at (-78, 75, 56), and index 9, the last of the saved fixture list, at
 * (-92, 75, 29). The gateway ring sits 96 blocks out, beyond the square above.
 */
const GATEWAY_CHUNKS = [
    [-5, 3],
    [-6, 1]
] as const;

const BLOCKS = [
    'minecraft:air',
    'minecraft:end_stone',
    'minecraft:bedrock',
    'minecraft:obsidian',
    'minecraft:iron_bars',
    'minecraft:fire',
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
    ],
    [
        'minecraft:xp_orb',
        entityFile('minecraft:xp_orb', {
            components: {
                'minecraft:collision_box': { width: 0.25, height: 0.25 },
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
    for (const [x, z] of GATEWAY_CHUNKS) chunks.set(Chunk.packXZ(x, z), endChunk(x, z));
    for (const spike of endSpikesForSeed(1234n)) {
        for (let chunkX = (spike.centerX - 10) >> 4; chunkX <= (spike.centerX + 10) >> 4; chunkX += 1) {
            for (let chunkZ = (spike.centerZ - 10) >> 4; chunkZ <= (spike.centerZ + 10) >> 4; chunkZ += 1) {
                chunks.set(Chunk.packXZ(chunkX, chunkZ), endChunk(chunkX, chunkZ));
            }
        }
    }

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
        generator: stub<Generator>({ generateChunk: async (x, z) => endChunk(x, z) }),
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

    describe('the dragon dying', () => {
        /**
         * The twenty cells of the active podium's ring: inside the rim's 2.5-block radius,
         * around the bedrock pillar. The research note's section 2 counts them at twenty.
         */
        const ringCells = (): [number, number][] => {
            const cells: [number, number][] = [];
            for (let x = -2; x <= 2; x += 1) {
                for (let z = -2; z <= 2; z += 1) {
                    if ((x !== 0 || z !== 0) && x * x + z * z < 2.5 * 2.5) cells.push([x, z]);
                }
            }
            return cells;
        };

        /** Kills the fight's live dragon through the real hurt path and lets the fight settle. */
        const killDragon = async (fight: DragonFight, killerId?: number): Promise<void> => {
            const dragon = dragons()[0];
            if (dragon === undefined) throw new Error('no dragon stands in the arena');
            dragon.instance.attributes.set('health', 1);
            live.runtime.hurt(dragon, killerId, 'entity_attack', 8);
            await run(fight, 2);
        };

        /** The values of every experience orb lying in the world, in spawn order. */
        const orbValues = (): unknown[] =>
            live.runtime
                .all()
                .filter((entity) => entity.identifier === 'minecraft:xp_orb')
                .map((orb) => orb.spawnData?.['value']);

        it('opens the portal, drops the egg and spends a gateway on the first kill', async () => {
            const { player } = enterArena(world, players, 0, 70, 0);
            const fight = freshFight();
            await run(fight, 1);

            await killDragon(fight, Number(player.getRuntimeId()));

            const cells = ringCells();
            expect(cells).toHaveLength(20);
            for (const [x, z] of cells) expect(blockNameAt(world, x, FLOOR_Y, z)).toBe('minecraft:end_portal');
            // The egg sits at the MOTION_BLOCKING heightmap position above (0, 0): the pillar top.
            expect(blockNameAt(world, 0, FLOOR_Y + 4, 0)).toBe('minecraft:dragon_egg');
            // Index 8, popped from seed 1234's shuffle, lands at Java's ring position (-78, 75, 56).
            expect(blockNameAt(world, -78, 75, 56)).toBe('minecraft:end_gateway');
            expect(blockNameAt(world, -78, 77, 56)).toBe('minecraft:bedrock');
            expect(blockNameAt(world, -78, 73, 56)).toBe('minecraft:bedrock');
            expect(blockNameAt(world, -77, 75, 56)).toBe('minecraft:air');
            expect(fight.state().gateways).toHaveLength(19);
            expect(fight.state().gateways).not.toContain(8);
            expect(fight.state().dragonKilled).toBe(true);
            expect(fight.state().previouslyKilled).toBe(true);
        });

        it('fills the ring with the block the travel rules carry a player out with', async () => {
            const { player } = enterArena(world, players, 0, 70, 0);
            const fight = freshFight();
            await run(fight, 1);

            await killDragon(fight, Number(player.getRuntimeId()));

            const ring = blockNameAt(world, 1, FLOOR_Y, 0);
            const rule = ring === undefined ? undefined : portalRuleOf(ring);
            expect(rule?.kind).toBe('end');
            expect(rule?.links[END.id]).toBe(Dimensions.Overworld.id);
        });

        it('pays the first kill 12000 points, as orbs and directly to the killer', async () => {
            const { player } = enterArena(world, players, 0, 70, 0);
            const fight = freshFight();
            await run(fight, 1);

            await killDragon(fight, Number(player.getRuntimeId()));

            // Java's split: ten awards of floor(12000 * 0.08) over the death hold, floor(12000 * 0.2) at its end.
            expect(orbValues()).toEqual([...Array.from({ length: 10 }, () => 960), 2400]);
            // 12000 points from scratch: 1395 reach level 30, the rest climbs Java's 9n - 158
            // curve to level 68 with 22 points toward the 454-point level 69.
            expect(player.attributes.getValue(AttributeIds.PlayerLevel)).toBe(68);
            expect(player.attributes.getValue(AttributeIds.PlayerExperience)).toBeCloseTo(22 / 454, 10);
        });

        it('pays 500, spends the next gateway and places no egg on a repeat kill', async () => {
            const { player } = enterArena(world, players, 0, 70, 0);
            const fight = freshFight({ ...killedState(), dragonKilled: false });
            await run(fight, 1);

            await killDragon(fight, Number(player.getRuntimeId()));

            for (const [x, z] of ringCells()) expect(blockNameAt(world, x, FLOOR_Y, z)).toBe('minecraft:end_portal');
            expect(blockNameAt(world, 0, FLOOR_Y + 4, 0)).toBe('minecraft:air');
            // Index 9, the last of the saved list, lands at (-92, 75, 29); the list keeps the rest.
            expect(blockNameAt(world, -92, 75, 29)).toBe('minecraft:end_gateway');
            expect(fight.state().gateways).toEqual([4, 2]);
            expect(orbValues()).toEqual([...Array.from({ length: 10 }, () => 40), 100]);
            // 500 points from scratch: 315 reach level 15, the rest climbs to level 19 with 7
            // points toward the 57-point level 20.
            expect(player.attributes.getValue(AttributeIds.PlayerLevel)).toBe(19);
            expect(player.attributes.getValue(AttributeIds.PlayerExperience)).toBeCloseTo(7 / 57, 10);
        });

        it('pays the orbs but no direct award when no player dealt the killing blow', async () => {
            const { player } = enterArena(world, players, 0, 70, 0);
            const fight = freshFight();
            await run(fight, 1);
            const dragon = dragons()[0]!;

            live.runtime.remove(dragon.id, 'death_behavior');
            await run(fight, 2);

            expect(orbValues()).toEqual([...Array.from({ length: 10 }, () => 960), 2400]);
            expect(player.attributes.getValue(AttributeIds.PlayerLevel)).toBe(0);
        });
    });

    describe('respawning the dragon', () => {
        const addRespawnCrystal = (x: number, z: number): DataEntity | undefined => {
            world.setLoadedBlockRuntimeId(x, FLOOR_Y + 1, z, idOf('minecraft:bedrock'));
            return live.runtime.spawn('minecraft:ender_crystal', {
                x: x + 0.5,
                y: FLOOR_Y + 2,
                z: z + 0.5
            });
        };

        const addFourRespawnCrystals = (): DataEntity[] => {
            const crystals = [
                addRespawnCrystal(3, 0),
                addRespawnCrystal(-3, 0),
                addRespawnCrystal(0, 3),
                addRespawnCrystal(0, -3)
            ];
            return crystals.filter((crystal) => crystal !== undefined);
        };

        it('requires four edge crystals and runs the complete saved stage timeline', async () => {
            enterArena(world, players, 0, 70, 0);
            const fight = freshFight(killedState());
            const firstThree = [addRespawnCrystal(3, 0), addRespawnCrystal(-3, 0), addRespawnCrystal(0, 3)].filter(
                (crystal) => crystal !== undefined
            );
            expect(firstThree).toHaveLength(3);
            expect(fight.tryRespawn()).toBe(false);
            const last = addRespawnCrystal(0, -3);
            if (last === undefined) throw new Error('the fourth respawn crystal did not spawn');
            const crystals = [...firstThree, last];

            expect(crystals).toHaveLength(4);
            expect(fight.tryRespawn()).toBe(true);
            expect(fight.state().respawnStage).toBe('start');
            expect(fight.state().respawnCrystalIds).toEqual(crystals.map((crystal) => crystal.persistentIdentity));
            expect(fight.tryRespawn()).toBe(false);

            await run(fight, 1);
            expect(fight.state().respawnStage).toBe('preparing_to_summon_pillars');
            expect(crystals[0]?.body.beamTarget).toEqual({ x: 0, y: 128, z: 0 });
            await run(fight, 99);
            expect(fight.state().respawnTime).toBe(99);
            await run(fight, 1);
            expect(fight.state().respawnStage).toBe('summoning_pillars');

            await run(fight, 40);
            expect(fight.state().respawnTime).toBe(40);
            const firstSpike = endSpikesForSeed(world.getSeed())[0];
            if (firstSpike === undefined) throw new Error('the End spike list was empty');
            const firstPillarCrystal = live.runtime
                .all()
                .find(
                    (entity) =>
                        entity.identifier === 'minecraft:ender_crystal' &&
                        Math.floor(entity.position.x) === firstSpike.centerX &&
                        Math.floor(entity.position.z) === firstSpike.centerZ
                );
            expect(firstPillarCrystal?.body.invulnerable).toBe(true);
            expect(firstPillarCrystal?.body.beamTarget).toEqual({ x: 0, y: 128, z: 0 });

            await run(fight, 360);
            expect(fight.state().respawnStage).toBe('summoning_dragon');
            expect(fight.state().dragonKilled).toBe(true);
            await run(fight, 99);
            expect(dragons()).toHaveLength(0);
            await run(fight, 1);

            expect(fight.state().respawnStage).toBeUndefined();
            expect(fight.state().respawnTime).toBe(0);
            expect(fight.state().respawnCrystalIds).toEqual([]);
            expect(fight.state().dragonKilled).toBe(false);
            expect(dragons()).toHaveLength(1);
            expect(crystals.every((crystal) => crystal.removed === 'respawn complete')).toBe(true);
            expect(
                live.runtime
                    .all()
                    .filter((entity) => entity.identifier === 'minecraft:ender_crystal')
                    .every((crystal) => !crystal.body.invulnerable && crystal.body.beamTarget === undefined)
            ).toBe(true);
        });

        it('aborts when one of the four driving crystals dies and restores the active podium', async () => {
            enterArena(world, players, 0, 70, 0);
            const fight = freshFight(killedState());
            const crystals = addFourRespawnCrystals();
            expect(fight.tryRespawn()).toBe(true);
            await run(fight, 1);

            const destroyed = crystals[0];
            if (destroyed === undefined) throw new Error('no respawn crystals were created');
            live.runtime.remove(destroyed.id, 'death');

            expect(fight.state().respawnStage).toBeUndefined();
            expect(fight.state().respawnCrystalIds).toEqual([]);
            expect(blockNameAt(world, 1, FLOOR_Y, 0)).toBe('minecraft:end_portal');
            expect(crystals.slice(1).every((crystal) => crystal.body.beamTarget === undefined)).toBe(true);
        });

        it('aborts a saved sequence when a driving crystal is missing after reload', async () => {
            enterArena(world, players, 0, 70, 0);
            const fight = freshFight(killedState());
            const crystals = addFourRespawnCrystals();
            expect(fight.tryRespawn()).toBe(true);
            await run(fight, 2);
            const saved = { ...fight.state(), respawnCrystalIds: [...fight.state().respawnCrystalIds] };
            const missing = crystals[0];
            if (missing === undefined) throw new Error('no respawn crystals were created');
            live.runtime.remove(missing.id, 'chunk unload');

            const reloaded = freshFight(saved);
            await run(reloaded, 1);

            expect(reloaded.state().respawnStage).toBeUndefined();
            expect(reloaded.state().respawnCrystalIds).toEqual([]);
            expect(blockNameAt(world, 1, FLOOR_Y, 0)).toBe('minecraft:end_portal');
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
