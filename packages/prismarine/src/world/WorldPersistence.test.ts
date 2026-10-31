import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Vector3 } from '@jsprismarine/math';
import type { Logger } from '@jsprismarine/logger';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Item as ItemEntity } from '../entity/other/Item';
import { Item } from '../item/Item';
import type Server from '../Server';
import { stub } from '../testing/stub.test.helper';
import { inertEntityRuntime, testContent } from '../testing/entityServer';
import Chunk from './chunk/Chunk';
import { Dimensions } from './Dimension';
import type { Generator } from './Generator';
import LevelDB from './providers/leveldb/LevelDB';
import { World } from './World';
import { parseLevelStem } from '@jsprismarine/worldgen';
import { parseWorldPersistenceData, worldPersistenceJsonOf } from './WorldPersistence';
import type { WorldPersistenceData } from './WorldPersistence';
import { OVERWORLD_STEM_ID } from '@jsprismarine/worldgen';
import { testLevel } from '../testing/level';

const LEGACY_ITEM_COUNT = 1744;
const NEXT_DROP_COUNT = World.ITEM_ENTITY_LIMIT - LEGACY_ITEM_COUNT + 1;

let scratch: string;
let previousDirectory: string | undefined;

const testServer = (warnings: string[]): Server =>
    stub<Server>({
        getLogger: () =>
            stub<Logger>({
                info: () => {},
                warn: (message: string) => warnings.push(message),
                error: () => {},
                debug: () => {},
                verbose: () => {}
            }),
        getConfig: () => stub({ getPreloadRadius: () => 0 }),
        getContent: () => testContent(),
        getEntityRuntime: () => inertEntityRuntime()
    });

const generator: Generator = {
    generateChunk: async (x, z) => new Chunk(x, z, new Map(), Dimensions.Overworld)
};

beforeEach(() => {
    previousDirectory = process.env.JSP_DIR;
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-world-persistence-'));
    process.env.JSP_DIR = scratch;
});

afterEach(() => {
    if (previousDirectory === undefined) delete process.env.JSP_DIR;
    else process.env.JSP_DIR = previousDirectory;

    fs.rmSync(scratch, { recursive: true, force: true });
});

describe('persisted stems', () => {
    /** Stems as a world preset spells them, one per generator kind and biome source. */
    const stems = {
        'minecraft:overworld': {
            type: 'minecraft:overworld',
            generator: {
                type: 'minecraft:noise',
                settings: 'minecraft:overworld',
                biome_source: { type: 'minecraft:multi_noise', preset: 'minecraft:overworld' }
            }
        },
        'minecraft:the_end': {
            type: 'minecraft:the_end',
            generator: {
                type: 'minecraft:noise',
                settings: 'minecraft:end',
                biome_source: { type: 'minecraft:the_end' }
            }
        },
        'mypack:flat': {
            type: 'minecraft:overworld',
            generator: {
                type: 'minecraft:flat',
                settings: {
                    biome: 'minecraft:desert',
                    layers: [
                        { block: 'minecraft:bedrock', height: 1 },
                        { block: 'minecraft:sandstone', height: 67 }
                    ],
                    lakes: true,
                    structure_overrides: ['minecraft:villages']
                }
            }
        },
        'mypack:checker': {
            type: 'minecraft:overworld',
            generator: {
                type: 'minecraft:noise',
                settings: 'minecraft:overworld',
                biome_source: {
                    type: 'minecraft:checkerboard',
                    biomes: ['minecraft:plains', 'minecraft:desert'],
                    scale: 3
                }
            }
        },
        'mypack:one': {
            type: 'minecraft:overworld',
            generator: {
                type: 'minecraft:noise',
                settings: 'minecraft:overworld',
                biome_source: { type: 'minecraft:fixed', biome: 'minecraft:plains' }
            }
        },
        'mypack:inline': {
            type: 'minecraft:overworld',
            generator: {
                type: 'minecraft:noise',
                settings: { sea_level: 63 },
                biome_source: {
                    type: 'minecraft:multi_noise',
                    biomes: [
                        {
                            biome: 'minecraft:plains',
                            parameters: {
                                temperature: [-0.15, 0.2],
                                humidity: [-0.35, 0.1],
                                continentalness: [0.03, 0.3],
                                erosion: [-0.375, -0.2225],
                                depth: 0,
                                weirdness: [-1, -0.93333334],
                                offset: 0
                            }
                        }
                    ]
                }
            }
        },
        'mypack:preset_flat': {
            type: 'minecraft:overworld',
            generator: { type: 'minecraft:flat', settings: 'minecraft:classic_flat' }
        },
        'mypack:debug': { type: 'minecraft:overworld', generator: { type: 'minecraft:debug' } },
        'mypack:void': {
            type: 'minecraft:overworld',
            generator: { type: 'jsprismarine:void', settings: { note: 'kept as written' } }
        }
    };

    const parsed: WorldPersistenceData = {
        spawn: { x: 1, y: 2, z: 3 },
        worldGenSettings: {
            seed: '8475011743740320021',
            dimensions: Object.fromEntries(Object.entries(stems).map(([id, stem]) => [id, parseLevelStem(stem)]))
        }
    };

    it('writes a stem back as the Java document it was parsed from', () => {
        const json = worldPersistenceJsonOf(parsed);

        expect(json).toMatchObject({
            spawn: { x: 1, y: 2, z: 3 },
            worldGenSettings: {
                seed: '8475011743740320021',
                dimensions: {
                    'minecraft:overworld': stems['minecraft:overworld'],
                    'minecraft:the_end': stems['minecraft:the_end'],
                    'mypack:checker': stems['mypack:checker'],
                    'mypack:one': stems['mypack:one'],
                    'mypack:preset_flat': stems['mypack:preset_flat'],
                    'mypack:debug': stems['mypack:debug'],
                    'mypack:void': stems['mypack:void'],
                    'mypack:flat': {
                        ...stems['mypack:flat'],
                        generator: {
                            ...stems['mypack:flat'].generator,
                            settings: { ...stems['mypack:flat'].generator.settings, features: false }
                        }
                    }
                }
            }
        });
    });

    it('reads every stem back equal through JSON', () => {
        const text = JSON.stringify(worldPersistenceJsonOf(parsed));

        expect(parseWorldPersistenceData(text)).toEqual(parsed);
    });

    it('leaves the record without stems alone', () => {
        const data: WorldPersistenceData = { spawn: { x: 1, y: 2, z: 3 }, gameRules: [] };

        expect(worldPersistenceJsonOf(data)).toEqual(data);
        expect(parseWorldPersistenceData(JSON.stringify(data))).toEqual(data);
    });

    it('refuses a stem that does not parse rather than starting with other terrain', () => {
        const text = JSON.stringify({
            worldGenSettings: { seed: '1', dimensions: { 'minecraft:overworld': { type: 'minecraft:overworld' } } }
        });

        expect(() => parseWorldPersistenceData(text)).toThrow(/worldGenSettings\.dimensions\["minecraft:overworld"\]/);
    });
});

describe('world persistence', () => {
    it('does not count legacy level.json item snapshots against the live drop limit', async () => {
        const name = 'legacy-items';
        const folder = path.join(scratch, 'worlds', name);
        fs.mkdirSync(folder, { recursive: true });

        const levelPath = path.join(folder, 'level.json');
        fs.writeFileSync(
            levelPath,
            JSON.stringify({
                spawn: { x: 0, y: 64, z: 0 },
                gameRules: [],
                weather: {
                    clearWeatherTime: 0,
                    rainTime: 0,
                    thunderTime: 0,
                    raining: false,
                    thundering: false
                },
                entities: Array.from({ length: LEGACY_ITEM_COUNT }, (_, index) => ({
                    type: 'minecraft:item',
                    position: { x: index, y: 64, z: 0 }
                }))
            })
        );

        const warnings: string[] = [];
        const server = testServer(warnings);
        const provider = new LevelDB(folder, server);
        const level = testLevel({ name, path: folder, server, provider, generator });
        await level.enable();

        try {
            const world = await level.world(OVERWORLD_STEM_ID);
            await world.dropContents(
                new Vector3(0, 64, 0),
                Array.from(
                    { length: NEXT_DROP_COUNT },
                    () => new Item({ runtimeId: 4, name: 'minecraft:cobblestone', meta: 0 })
                )
            );

            expect(warnings).toEqual([]);
            expect(world.getEntities().filter((entity) => entity instanceof ItemEntity)).toHaveLength(NEXT_DROP_COUNT);
            expect(fs.existsSync(levelPath)).toBe(false);

            await world.saveLevelData();

            expect(fs.existsSync(levelPath)).toBe(false);
            expect(await provider.readWorldData()).toMatchObject({
                spawn: { x: 0, y: 64, z: 0 },
                gameRules: expect.any(Array),
                weather: {
                    clearWeatherTime: 0,
                    rainTime: 0,
                    thunderTime: 0,
                    raining: false,
                    thundering: false
                }
            });
        } finally {
            await level.disable();
        }
    });
});
