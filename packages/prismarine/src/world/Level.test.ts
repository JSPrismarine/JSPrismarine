/**
 * One level, several dimensions, one save: what `Level` owns and what it hands to its worlds.
 *
 * Over a real LevelDB in a scratch folder, because the save-level state is the point: one
 * `level.dat` and one provider record for every dimension, and a second level over the same
 * folder reading back what the first wrote.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { Generator as GeneratorType } from '@jsprismarine/minecraft';
import { Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';
import type { DimensionTypeDefinition, LevelStem } from '@jsprismarine/worldgen';
import { OVERWORLD_STEM_ID } from '@jsprismarine/worldgen';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Config } from '../config/Config';
import type { Entity } from '../entity/Entity';
import type PlayerSession from '../network/PlayerSession';
import Player from '../Player';
import type Server from '../Server';
import { inertEntityRuntime, testContent } from '../testing/entityServer';
import { TEST_GENERATOR_KIND } from '../testing/level';
import { stub, stubOf } from '../testing/stub.test.helper';
import Chunk from './chunk/Chunk';
import { Dimensions, FIRST_CUSTOM_DIMENSION_ID } from './Dimension';
import type { DimensionType } from './Dimension';
import { GameRules } from './GameRuleManager';
import type { Generator } from './Generator';
import { GeneratorFactories } from './GeneratorFactories';
import { Level } from './Level';
import { DimensionTravel } from './portal/DimensionTravel';
import type { LevelOptions } from './Level';
import { Position } from './Position';
import { readLevelDat } from './providers/leveldb/LevelDat';
import LevelDB from './providers/leveldb/LevelDB';
import type { World } from './World';

const NETHER_STEM_ID = 'minecraft:the_nether';

/** A dimension the Bedrock overlay has no row for, so the level has to give it an id. */
const SKY_STEM_ID = 'mypack:sky';
const SKY_TYPE_ID = 'mypack:sky_type';

/** A second custom dimension, so the ids can be seen to count up in stem order. */
const CAVES_STEM_ID = 'mypack:caves';
const CAVES_TYPE_ID = 'mypack:caves_type';

const stemOf = (type: string): LevelStem => ({ type, generator: { type: TEST_GENERATOR_KIND, settings: undefined } });

/** The Overworld's type under another id, with the one attribute the announcement reads. */
const skyType: DimensionTypeDefinition = {
    ...Dimensions.Overworld.java,
    attributes: new Map([['minecraft:visual/cloud_height', 192.33]])
};

/** The Nether's type under another id, with no clouds and a ceiling. */
const cavesType: DimensionTypeDefinition = { ...Dimensions.Nether.java, attributes: new Map() };

const STEMS: ReadonlyMap<string, LevelStem> = new Map([
    [OVERWORLD_STEM_ID, stemOf(Dimensions.Overworld.id)],
    [NETHER_STEM_ID, stemOf(Dimensions.Nether.id)],
    [SKY_STEM_ID, stemOf(SKY_TYPE_ID)],
    [CAVES_STEM_ID, stemOf(CAVES_TYPE_ID)]
]);

const DIMENSION_TYPES: ReadonlyMap<string, DimensionTypeDefinition> = new Map([
    [Dimensions.Overworld.id, Dimensions.Overworld.java],
    [Dimensions.Nether.id, Dimensions.Nether.java],
    [SKY_TYPE_ID, skyType],
    [CAVES_TYPE_ID, cavesType]
]);

let scratch: string;

/**
 * @param preloadRadius - How far around spawn an enabling world generates. Zero, the default,
 *   keeps the start region out of every test but the one about it.
 */
const testServer = (preloadRadius = 0): Server => {
    const server: Server = stub<Server>({
        getLogger: () =>
            stub<Logger>({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, verbose: () => {} }),
        getConfig: () => stub<Config>({ getPreloadRadius: () => preloadRadius, getEntityTrackingInterval: () => 20 }),
        getContent: () => testContent(),
        getEntityRuntime: () => inertEntityRuntime(),
        // The tick asks every world for its portal contacts; nothing here stands in one.
        getDimensionTravel: () => new DimensionTravel(server)
    });
    return server;
};

/**
 * Empty chunks in the dimension asked for, and dry land at every column so the spawn search
 * settles on its first candidate without generating anything.
 */
const emptyGenerator = (dimension: DimensionType): Generator => ({
    generateChunk: async (cx, cz) => new Chunk(cx, cz, new Map(), dimension),
    surfaceAt: () => ({ y: 64, name: 'minecraft:stone' })
});

/**
 * A level over a scratch folder whose factory counts what it built, by dimension type id.
 *
 * @param generatorFor - What the factory builds for each dimension. Defaults to empty chunks
 *   over dry land.
 */
const buildLevel = (
    name: string,
    options: Partial<LevelOptions> = {},
    generatorFor = emptyGenerator,
    server = testServer()
) => {
    const folder = path.join(scratch, name);
    const provider = new LevelDB(folder, server);
    const builds = new Map<string, number>();
    const factories = new GeneratorFactories([
        {
            kind: TEST_GENERATOR_KIND,
            build: (context) => {
                builds.set(context.dimension.id, (builds.get(context.dimension.id) ?? 0) + 1);
                return generatorFor(context.dimension);
            }
        }
    ]);

    const level = new Level({
        name,
        path: folder,
        server,
        provider,
        seed: 1234n,
        stems: STEMS,
        dimensionTypes: DIMENSION_TYPES,
        factories,
        worldgen: () => {
            throw new Error('this level never reads the Java registries');
        },
        ...options
    });

    return { level, provider, builds, folder };
};

beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-level-'));
});

afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
});

describe('Level', () => {
    describe('its dimensions', () => {
        it('needs an Overworld stem and a type for every stem', () => {
            expect(() =>
                buildLevel('no-overworld', { stems: new Map([[NETHER_STEM_ID, stemOf('minecraft:the_nether')]]) })
            ).toThrowError('has no minecraft:overworld stem');
            expect(() =>
                buildLevel('no-type', { stems: new Map([[OVERWORLD_STEM_ID, stemOf('mypack:missing')]]) })
            ).toThrowError('names the dimension type mypack:missing, which is not loaded');
        });

        it('refuses two stems that bind one dimension type, naming both', () => {
            expect(() =>
                buildLevel('shared-type', {
                    stems: new Map([
                        [OVERWORLD_STEM_ID, stemOf(Dimensions.Overworld.id)],
                        [NETHER_STEM_ID, stemOf(Dimensions.Nether.id)],
                        [SKY_STEM_ID, stemOf(Dimensions.Nether.id)]
                    ])
                })
            ).toThrowError(
                'The minecraft:the_nether and mypack:sky stems of level shared-type both bind the dimension type minecraft:the_nether; a type backs one dimension per level'
            );
        });

        it('builds a dimension once and answers the same world every time after', async () => {
            const { level, builds } = buildLevel('lazy');
            await level.enable();
            expect(level.loadedWorld(NETHER_STEM_ID)).toBeUndefined();

            // Two overlapping first requests share one build.
            const [first, second] = await Promise.all([level.world(NETHER_STEM_ID), level.world(NETHER_STEM_ID)]);
            const third = await level.world(NETHER_STEM_ID);

            expect(second).toBe(first);
            expect(third).toBe(first);
            expect(builds.get(Dimensions.Nether.id)).toBe(1);
            expect(level.loadedWorld(NETHER_STEM_ID)).toBe(first);
            expect([...level.worlds()]).toEqual([first]);

            // The world reaches the level and its stem, and took the dimension the stem names.
            expect(first.getLevel()).toBe(level);
            expect(first.getStem()).toBe(STEMS.get(NETHER_STEM_ID));
            expect(first.getDimension().id).toBe(Dimensions.Nether.id);
            expect(first.getSeed()).toBe(1234n);

            await level.disable();
        });

        it('builds an eager stem as it opens, before anything awaits', async () => {
            const { level, builds } = buildLevel('eager', { load: new Map([[OVERWORLD_STEM_ID, 'eager']]) });

            const enabling = level.enable();
            // Available at once, which is how `WorldManager` names the default world before the
            // start region has generated.
            const overworld = level.loadedWorld(OVERWORLD_STEM_ID);
            expect(overworld).toBeDefined();
            // Not yet among the worlds that tick, save and answer `getWorldByDimension`: those
            // are the ones whose enabling has finished.
            expect([...level.worlds()]).toEqual([]);
            await enabling;

            expect([...level.worlds()]).toEqual([overworld]);
            expect(builds).toEqual(new Map([[Dimensions.Overworld.id, 1]]));
            expect(await level.world(OVERWORLD_STEM_ID)).toBe(overworld);
            expect(level.loadedWorld(NETHER_STEM_ID)).toBeUndefined();

            await level.disable();
        });

        it('prepares the start region of an eager world and leaves a lazy one to its first visitor', async () => {
            // One chunk around spawn, so the preload is nine generated chunks per prepared world.
            const generated = new Map<string, number>();
            const searched = new Map<string, number>();
            const count = (counts: Map<string, number>, id: string) => counts.set(id, (counts.get(id) ?? 0) + 1);
            const { level } = buildLevel(
                'start-region',
                { load: new Map([[OVERWORLD_STEM_ID, 'eager']]) },
                (dimension) => ({
                    generateChunk: async (cx, cz) => {
                        count(generated, dimension.id);
                        return new Chunk(cx, cz, new Map(), dimension);
                    },
                    surfaceAt: () => {
                        count(searched, dimension.id);
                        return { y: 64, name: 'minecraft:stone' };
                    }
                }),
                testServer(1)
            );

            await level.enable();
            expect(searched.get(Dimensions.Overworld.id)).toBeGreaterThan(0);
            expect(generated.get(Dimensions.Overworld.id)).toBe(9);

            // Built on a first portal trip, inside a server tick: the arrival's chunks are the
            // travel path's to load, and a Nether spawn search would generate terrain nobody
            // is standing on.
            await level.world(NETHER_STEM_ID);
            expect(searched.get(Dimensions.Nether.id)).toBeUndefined();
            expect(generated.get(Dimensions.Nether.id)).toBeUndefined();

            await level.disable();
        });

        it('forgets a world whose enabling failed, so the next request builds it again', async () => {
            // Dry land everywhere except on the first look, so the Nether's spawn search fails
            // once while it is being enabled and succeeds when it is built again.
            let failures = 1;
            const { level, builds } = buildLevel(
                'retry',
                { load: new Map([[NETHER_STEM_ID, 'eager']]) },
                (dimension) => ({
                    ...emptyGenerator(dimension),
                    surfaceAt: () => {
                        if (dimension.id === Dimensions.Nether.id && failures-- > 0) throw new Error('no footing');
                        return { y: 64, name: 'minecraft:stone' };
                    }
                })
            );

            await expect(level.enable()).rejects.toThrowError('no footing');
            expect(level.loadedWorld(NETHER_STEM_ID)).toBeUndefined();
            expect([...level.worlds()]).toEqual([]);

            const nether = await level.world(NETHER_STEM_ID);
            expect(builds.get(Dimensions.Nether.id)).toBe(2);
            expect([...level.worlds()]).toEqual([nether]);

            await level.disable();
        });

        it('refuses a dimension no stem names, and a world before it is enabled', async () => {
            const { level } = buildLevel('refuses');

            await expect(level.world(OVERWORLD_STEM_ID)).rejects.toThrowError('is not enabled');

            await level.enable();
            await expect(level.world('minecraft:the_end')).rejects.toThrowError(
                'has no minecraft:the_end dimension. It has: minecraft:overworld, minecraft:the_nether, mypack:sky, mypack:caves'
            );
            await level.disable();
        });
    });

    describe('the clock', () => {
        it('advances once per tick however many worlds are loaded, and every world agrees', async () => {
            const { level } = buildLevel('clock');
            await level.enable();
            const overworld = await level.world(OVERWORLD_STEM_ID);
            const nether = await level.world(NETHER_STEM_ID);

            await level.update(1);
            await level.update(2);
            await level.update(3);

            expect(level.getTicks()).toBe(3);
            expect(overworld.getTicks()).toBe(3);
            expect(nether.getTicks()).toBe(3);

            // `/time set` through either world sets the one clock.
            nether.setTicks(6000);
            expect(overworld.getTicks()).toBe(6000);

            await level.disable();
        });
    });

    describe('the tick', () => {
        /**
         * A player, since a world ticks every player and only the mobs near one, whose own
         * update records the tick and, the first time, walks out of its world into `to`.
         */
        const travelerIn = (from: World, to: World) => {
            const updates: number[] = [];
            let position = new Position(0, 64, 0, from);
            const traveler: Entity = stubOf(Player, {
                attributes: new Attributes(),
                viewDistance: 4,
                getRuntimeId: () => 7n,
                getType: () => 'minecraft:player',
                getName: () => 'traveler',
                toString: () => 'traveler',
                getPosition: () => position,
                getWorld: () => position.getWorld(),
                getFeetY: () => position.getY() - 1.62,
                getBox: () => ({ width: 0.6, height: 1.8 }),
                isOnPortalCooldown: () => false,
                // A settled client: the portal pass asks whether a change is still pending.
                getNetworkSession: () => stub<PlayerSession>({ pendingDimensionChange: () => undefined }),
                update: async (tick) => {
                    updates.push(tick);
                    if (position.getWorld() !== from) return;
                    await from.removeEntity(traveler);
                    position = new Position(0, 64, 0, to);
                    await to.addEntity(traveler);
                }
            });
            return { traveler, updates };
        };

        it('ticks an entity once, however many worlds it crosses during the update', async () => {
            const { level } = buildLevel('crossing');
            await level.enable();
            const overworld = await level.world(OVERWORLD_STEM_ID);
            const nether = await level.world(NETHER_STEM_ID);

            // Leaving the world ticked first for the one ticked second is the case a sequential
            // tick alone would get wrong: the Nether reads its roster after the Overworld's tick
            // has put the traveler in it.
            const { traveler, updates } = travelerIn(overworld, nether);
            await overworld.addEntity(traveler);

            await level.update(1);
            expect(updates).toEqual([1]);
            expect(nether.getEntities()).toContain(traveler);
            expect(overworld.getEntities()).not.toContain(traveler);

            // The next tick finds it in the Nether and ticks it there, once.
            await level.update(2);
            expect(updates).toEqual([1, 2]);

            await level.disable();
        });
    });

    describe('the game rules and the weather', () => {
        it('are one set for every world of the level', async () => {
            const { level } = buildLevel('shared');
            await level.enable();
            const overworld = await level.world(OVERWORLD_STEM_ID);
            const nether = await level.world(NETHER_STEM_ID);

            overworld.getGameRuleManager().setGameRule(GameRules.DoFireTick, false, true);
            expect(nether.getGameRuleManager().getGameRule(GameRules.DoFireTick)).toEqual([false, true]);

            overworld.setWeather('rain');
            expect(nether.getWeather()).toBe('rain');
            // The Nether has no sky, so no position in it is rained on.
            expect(nether.isRainingAt(0, 64, 0)).toBe(false);

            await level.disable();
        });
    });

    describe('the save', () => {
        it('writes one level.dat and one record for the whole level, and reads them back', async () => {
            const { level, provider, folder } = buildLevel('saved');
            await level.enable();
            const overworld = await level.world(OVERWORLD_STEM_ID);
            await level.world(NETHER_STEM_ID);

            overworld.setSpawnPosition(new Vector3(12, 70, -8));
            overworld.getGameRuleManager().setGameRule(GameRules.DoFireTick, false, true);
            level.setTicks(777);
            await level.save();

            // The Overworld's spawn is the level's, Bedrock's `SpawnX/Y/Z`.
            expect(level.getSpawn()).toEqual(new Vector3(12, 70, -8));

            const levelDat = readLevelDat(folder);
            expect(levelDat).not.toBeNull();
            expect(levelDat?.root.getNumber('SpawnX', Number.NaN)).toBe(12);
            expect(levelDat?.root.getNumber('SpawnY', Number.NaN)).toBe(70);
            expect(levelDat?.root.getNumber('SpawnZ', Number.NaN)).toBe(-8);
            expect(levelDat?.root.getLong('Time', -1n)).toBe(777n);
            expect(levelDat?.root.getNumber('Generator', -1)).toBe(GeneratorType.OVERWORLD);
            expect(levelDat?.root.getNumber('NetherScale', -1)).toBe(Dimensions.Nether.java.coordinateScale);

            const record = await provider.readWorldData();
            expect(record?.worldGenSettings?.seed).toBe('1234');
            expect(Object.keys(record?.worldGenSettings?.dimensions ?? {})).toEqual([...STEMS.keys()]);
            expect(fs.readdirSync(folder).filter((entry) => entry === 'level.dat')).toHaveLength(1);
            await level.disable();

            // A second level over the same folder, as a restart.
            const reopened = buildLevel('saved');
            await reopened.level.enable();
            expect(reopened.level.getSpawn()).toEqual(new Vector3(12, 70, -8));
            // The clock carries on from `Time` rather than starting the day over.
            expect(reopened.level.getTicks()).toBe(777);
            expect(reopened.level.getGameRuleManager().getGameRule(GameRules.DoFireTick)).toEqual([false, true]);
            // The spawn is known, so the Overworld opens without a search.
            const back = await reopened.level.world(OVERWORLD_STEM_ID);
            expect(back.getKnownSpawnPosition()).toEqual(new Vector3(12, 70, -8));
            await reopened.level.disable();
        });

        it('answers null for a player record the save has no entry for', async () => {
            const { level } = buildLevel('players');
            await level.enable();

            expect(await level.getPlayerData('nobody')).toBeNull();

            await level.disable();
        });

        it('declines to write a player record once it has closed', async () => {
            const { level } = buildLevel('closed');
            await level.enable();
            await level.disable();

            expect(level.isClosed()).toBe(true);
            // Nothing to write to, and nothing thrown: the shutdown's own save already ran.
            const record = { gamemode: 'survival', position: { x: 0, y: 64, z: 0, pitch: 0, yaw: 0, headYaw: 0 } };
            await expect(level.savePlayerData('late', record)).resolves.toBeUndefined();
        });
    });

    describe('custom dimensions', () => {
        it('gives a type without a Bedrock row an id from 1000, in stem order', () => {
            const { level } = buildLevel('custom');
            const types = level.getDimensionTypes();

            expect(types.get(Dimensions.Overworld.id)?.bedrockId).toBe(0);
            expect(types.get(Dimensions.Nether.id)?.bedrockId).toBe(1);
            expect(types.get(SKY_TYPE_ID)).toMatchObject({ bedrockId: FIRST_CUSTOM_DIMENSION_ID, custom: true });
            expect(types.get(CAVES_TYPE_ID)).toMatchObject({ bedrockId: FIRST_CUSTOM_DIMENSION_ID + 1, custom: true });
        });

        it('announces each custom type once, with the bounds and clouds the client needs', () => {
            const { level } = buildLevel('announced');

            expect(level.customDimensionDefinitions()).toEqual([
                {
                    minimumY: -64,
                    heightRange: 384,
                    generatorType: GeneratorType.VOID,
                    dimensionType: FIRST_CUSTOM_DIMENSION_ID,
                    packId: expect.objectContaining({ most: 0n, least: 0n }),
                    defaultBiome: 'minecraft:plains',
                    cloudHeight: 192,
                    renderClouds: true
                },
                {
                    minimumY: 0,
                    heightRange: 256,
                    generatorType: GeneratorType.VOID,
                    dimensionType: FIRST_CUSTOM_DIMENSION_ID + 1,
                    packId: expect.objectContaining({ most: 0n, least: 0n }),
                    defaultBiome: 'minecraft:plains',
                    cloudHeight: 0,
                    renderClouds: false
                }
            ]);
        });

        it('announces nothing for a vanilla level', () => {
            const { level } = buildLevel('vanilla', {
                stems: new Map([[OVERWORLD_STEM_ID, stemOf(Dimensions.Overworld.id)]])
            });

            expect(level.customDimensionDefinitions()).toEqual([]);
        });
    });
});
