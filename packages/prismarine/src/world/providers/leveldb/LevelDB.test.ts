import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTReader, NBTTagCompound, Types } from '@jsprismarine/nbt';
import { afterEach, describe, expect, it } from 'vitest';

import { BlockEntityRegistry } from '../../../blockentity/BlockEntityRegistry';
import { BlockRuntimeIds } from '../../../block/state/BlockRuntimeIds';
import type { Entity } from '../../../entity/Entity';
import {
    ChunkTag,
    decodeChunkKey,
    decodeDigest,
    encodeActorKey,
    encodeChunkKey,
    encodeDigestKey,
    encodePlayerServerKey
} from './LevelDBKeys';
import { Database } from '@jsprismarine/leveldb';
import { decodeLevelDat } from './LevelDat';
import type { DimensionType } from '../../Dimension';
import { Dimensions, FIRST_CUSTOM_DIMENSION_ID, dimensionTypeOf } from '../../Dimension';
import { VANILLA_DIMENSION_TYPES } from '../../vanillaDimensionTypes';
import { fakeLevel } from '../../../testing/level';
import type { StoredItemStack } from '../../../inventory/persistence';
import { stub } from '../../../testing/stub.test.helper';
import Chunk from '../../chunk/Chunk';
import type { Position } from '../../Position';
import LevelDB, { CHUNK_VERSION } from './LevelDB';
import { parseLevelStem } from '@jsprismarine/worldgen';
import type { Logger } from '@jsprismarine/logger';
import type Server from '../../../Server';
import type { World } from '../../World';
import type { WorldPlayerData } from '../../World';
import type { WorldPersistenceData } from '../../WorldPersistence';

const directories: string[] = [];

const scratch = (): string => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-world-'));
    directories.push(directory);
    return directory;
};

afterEach(() => {
    while (directories.length > 0) fs.rmSync(directories.pop()!, { recursive: true, force: true });
});

const id = (name: string) => BlockRuntimeIds.getByName(name);

/** `minecraft:desert`, `minecraft:jungle` and `minecraft:deep_dark` as the client numbers them. */
const DESERT = 2;
const JUNGLE = 21;
const DEEP_DARK = 190;

/**
 * The pieces of `Server` and `World` a provider touches. Hand-rolled rather than mocked, so what
 * the provider actually depends on stays visible.
 */
const harness = (worldPath: string, name = 'testworld', seed = 1234n, entities: Entity[] = []) => {
    const warnings: string[] = [];
    const logger = stub<Logger>({
        warn: (message: string) => {
            warnings.push(message);
        },
        debug: () => {},
        verbose: () => {},
        info: () => {},
        error: () => {}
    });
    const server = stub<Server>({ getLogger: () => logger });

    const world = stub<World>({
        getName: () => name,
        getSeed: () => seed,
        getDimension: () => Dimensions.Overworld,
        getEntities: () => entities,
        getServer: () => server
    });

    const provider = new LevelDB(worldPath, server);
    provider.setWorld(world);
    return { provider, warnings };
};

/** A generator stand-in that records whether it was asked for anything. */
const generator = (calls: Array<[number, number]> = []) => ({
    calls,
    generateChunk: async (cx: number, cz: number) => {
        calls.push([cx, cz]);
        return new Chunk(cx, cz, new Map(), Dimensions.Overworld);
    }
});

const buildChunk = (cx = 0, cz = 0): Chunk => {
    const chunk = new Chunk(cx, cz, new Map(), Dimensions.Overworld);

    for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
            chunk.fillColumn(x, z, -64, -60, id('minecraft:stone'));
        }
    }

    chunk.setBlockRuntimeId(3, -64, 4, id('minecraft:bedrock'));
    chunk.setBlockRuntimeId(8, 70, 9, id('minecraft:oak_log'));
    chunk.setBlockRuntimeId(1, 310, 1, id('minecraft:dirt'));
    return chunk;
};

describe('world', () => {
    describe('LevelDB provider', () => {
        it('creates a world folder shaped the way the game expects', async () => {
            const worldPath = scratch();
            const { provider } = harness(worldPath, 'MyWorld');
            await provider.enable();
            await provider.disable();

            expect(fs.existsSync(path.join(worldPath, 'db'))).toBe(true);
            expect(fs.existsSync(path.join(worldPath, 'db', 'CURRENT'))).toBe(true);
            expect(fs.existsSync(path.join(worldPath, 'level.dat'))).toBe(true);
            expect(fs.readFileSync(path.join(worldPath, 'levelname.txt'), 'utf8')).toBe('MyWorld');
        });

        it('writes a level.dat the game can read', async () => {
            const worldPath = scratch();
            const { provider } = harness(worldPath, 'MyWorld');
            await provider.enable();
            await provider.disable();

            const level = decodeLevelDat(fs.readFileSync(path.join(worldPath, 'level.dat')));

            expect(level.storageVersion).toBe(10);
            expect(level.root.getString('LevelName', '')).toBe('MyWorld');
            expect(level.root.getLong('RandomSeed', 0n)).toBe(1234n);
        });

        it.each([8475011743740320021n, -8475011743740320021n, 2n ** 63n - 1n])(
            'round-trips the seed %s through RandomSeed',
            async (seed) => {
                const worldPath = scratch();
                const { provider } = harness(worldPath, 'MyWorld', seed);
                await provider.enable();
                await provider.disable();

                const level = decodeLevelDat(fs.readFileSync(path.join(worldPath, 'level.dat')));

                expect(level.root.getLong('RandomSeed', 0n)).toBe(seed);
            }
        );

        it('keeps the RandomSeed of a world saved before the seed was 64 bit', async () => {
            const worldPath = scratch();
            const first = harness(worldPath, 'MyWorld', 1234n);
            await first.provider.enable();
            await first.provider.disable();

            // A level.dat that is already there is read and written back, never rebuilt, so a
            // world made by an older server keeps the seed it was generated with.
            const reopened = harness(worldPath, 'MyWorld', 9999n);
            await reopened.provider.enable();
            reopened.provider.saveLevelData({ spawn: { x: 1, y: 2, z: 3 } });
            await reopened.provider.disable();

            const level = decodeLevelDat(fs.readFileSync(path.join(worldPath, 'level.dat')));

            expect(level.root.getLong('RandomSeed', 0n)).toBe(1234n);
            expect(level.root.getNumber('SpawnX', 0)).toBe(1);
        });

        it('stores player data in a player_server NBT record', async () => {
            const worldPath = scratch();
            const { provider } = harness(worldPath);
            const data: WorldPlayerData = {
                uuid: 'player-uuid',
                username: 'Player',
                gamemode: 'Creative',
                position: { x: 1.25, y: 64.5, z: -3.75, pitch: 4, yaw: 90, headYaw: 91 }
            };

            await provider.enable();
            await provider.writePlayerData('player-xuid', data);
            await provider.disable();

            const database = await Database.open(path.join(worldPath, 'db'), { readOnly: true });
            const value = database.get(encodePlayerServerKey('player-xuid'));
            expect(value).not.toBeNull();
            if (value === null) throw new Error('Expected player_server record');

            const reader = new NBTReader(new BinaryStream(value), ByteOrder.LITTLE_ENDIAN);
            reader.setUseVarint(false);
            const nbt = reader.parse();
            expect(nbt.getString('NameTag', '')).toBe('Player');
            expect(nbt.getNumber('PlayerGameType', -1)).toBe(1);
            expect(nbt.getCompound('JSPrismarine', false)?.getString('uuid', '')).toBe('player-uuid');
            await database.close();

            const reopened = harness(worldPath);
            await reopened.provider.enable();
            expect(await reopened.provider.readPlayerData('player-xuid')).toEqual(data);
            await reopened.provider.disable();
        });

        it("writes a player's spawn point under Bedrock's own SpawnX tags", async () => {
            const worldPath = scratch();
            const { provider } = harness(worldPath);
            const data: WorldPlayerData = {
                username: 'Player',
                gamemode: 'Survival',
                position: { x: 0, y: 64, z: 0, pitch: 0, yaw: 0, headYaw: 0 },
                spawn: { x: 10, y: 64, z: -3, dimension: 'minecraft:overworld', forced: true },
                savedAt: 1_700_000_000_000
            };

            await provider.enable();
            await provider.writePlayerData('player-xuid', data);
            await provider.disable();

            const database = await Database.open(path.join(worldPath, 'db'), { readOnly: true });
            const value = database.get(encodePlayerServerKey('player-xuid'));
            if (value === null) throw new Error('Expected player_server record');

            const reader = new NBTReader(new BinaryStream(value), ByteOrder.LITTLE_ENDIAN);
            reader.setUseVarint(false);
            const nbt = reader.parse();
            expect(nbt.getNumber('SpawnX', 0)).toBe(10);
            expect(nbt.getNumber('SpawnY', 0)).toBe(64);
            expect(nbt.getNumber('SpawnZ', 0)).toBe(-3);
            await database.close();

            const reopened = harness(worldPath);
            await reopened.provider.enable();
            expect((await reopened.provider.readPlayerData('player-xuid'))?.spawn).toEqual(data.spawn);
            await reopened.provider.disable();
        });

        it('stores world state in LevelDB and the spawn in level.dat', async () => {
            const worldPath = scratch();
            const { provider } = harness(worldPath);
            const data = {
                spawn: { x: 10, y: 65, z: -3 },
                gameRules: [['keepInventory', [true, false]]],
                weather: {
                    clearWeatherTime: 0,
                    rainTime: 120,
                    thunderTime: 60,
                    raining: true,
                    thundering: false
                }
            } satisfies WorldPersistenceData;

            await provider.enable();
            await provider.writeWorldData(data);
            provider.saveLevelData({ spawn: data.spawn });

            expect(await provider.readWorldData()).toEqual(data);

            const level = decodeLevelDat(fs.readFileSync(path.join(worldPath, 'level.dat')));
            expect(level.root.getNumber('SpawnX', 0)).toBe(10);
            expect(level.root.getNumber('SpawnY', 0)).toBe(65);
            expect(level.root.getNumber('SpawnZ', 0)).toBe(-3);
            expect(level.root.getByte('JSPrismarineSpawnKnown', 0)).toBe(1);

            await provider.disable();

            const reopened = harness(worldPath);
            await reopened.provider.enable();
            expect(await reopened.provider.readWorldData()).toEqual(data);
            await reopened.provider.disable();
        });

        it('keeps the stems a save was generated with in the world data record', async () => {
            const worldPath = scratch();
            const { provider } = harness(worldPath);
            const data = {
                spawn: { x: 10, y: 65, z: -3 },
                worldGenSettings: {
                    seed: '1234',
                    dimensions: {
                        'minecraft:overworld': parseLevelStem({
                            type: 'minecraft:overworld',
                            generator: {
                                type: 'minecraft:noise',
                                settings: 'minecraft:large_biomes',
                                biome_source: { type: 'minecraft:multi_noise', preset: 'minecraft:overworld' }
                            }
                        }),
                        'minecraft:the_nether': parseLevelStem({
                            type: 'minecraft:the_nether',
                            generator: {
                                type: 'minecraft:noise',
                                settings: 'minecraft:nether',
                                biome_source: { type: 'minecraft:multi_noise', preset: 'minecraft:nether' }
                            }
                        })
                    }
                }
            } satisfies WorldPersistenceData;

            await provider.enable();
            await provider.writeWorldData(data);
            expect(await provider.readWorldData()).toEqual(data);
            await provider.disable();

            const reopened = harness(worldPath);
            await reopened.provider.enable();
            expect(await reopened.provider.readWorldData()).toEqual(data);
            await reopened.provider.disable();
        });

        it('keeps the dragon fight in the world data record', async () => {
            const worldPath = scratch();
            const { provider } = harness(worldPath);
            const data = {
                dragonFight: {
                    dragonKilled: true,
                    previouslyKilled: true,
                    needsStateScanning: false,
                    dragonUniqueId: '9f4a1c2e-3b5d-4e6f-8a7b-0c1d2e3f4a5b',
                    exitPortalLocation: { x: 0, y: 64, z: 0 },
                    gateways: [17, 3, 0],
                    respawnTime: 0,
                    respawnCrystalIds: []
                }
            } satisfies WorldPersistenceData;

            await provider.enable();
            await provider.writeWorldData(data);
            expect(await provider.readWorldData()).toEqual(data);
            await provider.disable();

            const reopened = harness(worldPath);
            await reopened.provider.enable();
            expect(await reopened.provider.readWorldData()).toEqual(data);
            await reopened.provider.disable();
        });

        describe('level.dat', () => {
            const levelDat = (worldPath: string) =>
                decodeLevelDat(fs.readFileSync(path.join(worldPath, 'level.dat'))).root;

            /** The vanilla `minecraft:flat` preset's Overworld stem, as a world preset file spells it. */
            const flatOverworld = parseLevelStem({
                type: 'minecraft:overworld',
                generator: {
                    type: 'minecraft:flat',
                    settings: {
                        biome: 'minecraft:plains',
                        layers: [
                            { block: 'minecraft:bedrock', height: 1 },
                            { block: 'minecraft:dirt', height: 2 },
                            { block: 'minecraft:grass_block', height: 1 }
                        ]
                    }
                }
            });
            const noiseOverworld = parseLevelStem({
                type: 'minecraft:overworld',
                generator: {
                    type: 'minecraft:noise',
                    settings: 'minecraft:overworld',
                    biome_source: { type: 'minecraft:multi_noise', preset: 'minecraft:overworld' }
                }
            });

            it('starts a fresh save as an Infinite world with the default Nether scale and clock', async () => {
                const worldPath = scratch();
                const { provider } = harness(worldPath);
                await provider.enable();
                await provider.disable();

                const root = levelDat(worldPath);
                expect(root.getNumber('Generator', -1)).toBe(1);
                expect(root.getNumber('NetherScale', -1)).toBe(8);
                expect(root.getLong('Time', -1n)).toBe(0n);
                expect(root.has('FlatWorldLayers')).toBe(false);
            });

            it('writes the clock as Time and keeps the spawn when none is given', async () => {
                const worldPath = scratch();
                const { provider } = harness(worldPath);
                await provider.enable();
                provider.saveLevelData({ spawn: { x: 4, y: 70, z: -2 } });
                provider.saveLevelData({ time: 24_000 * 3 + 17 });
                await provider.disable();

                const root = levelDat(worldPath);
                expect(root.getLong('Time', -1n)).toBe(72_017n);
                expect(root.getNumber('SpawnX', 0)).toBe(4);
                expect(root.getByte('JSPrismarineSpawnKnown', 0)).toBe(1);
            });

            it('writes Generator 2 and the FlatWorldLayers JSON for a flat Overworld stem', async () => {
                const worldPath = scratch();
                const { provider } = harness(worldPath);
                await provider.enable();
                provider.saveLevelData({ stems: { 'minecraft:overworld': flatOverworld }, netherScale: 8 });
                await provider.disable();

                const root = levelDat(worldPath);
                expect(root.getNumber('Generator', -1)).toBe(2);
                expect(root.getNumber('NetherScale', -1)).toBe(8);
                // The wiki's default for the field, byte for byte in meaning if not in key order.
                expect(JSON.parse(root.getString('FlatWorldLayers', ''))).toEqual({
                    biome_id: 1,
                    block_layers: [
                        { block_name: 'minecraft:bedrock', count: 1 },
                        { block_name: 'minecraft:dirt', count: 2 },
                        { block_name: 'minecraft:grass_block', count: 1 }
                    ],
                    encoding_version: 6,
                    preset_id: 'ClassicFlat',
                    structure_options: null,
                    world_version: 'version.post_1_18'
                });
            });

            it('writes Generator 1 and no FlatWorldLayers once the Overworld stem is a noise one', async () => {
                const worldPath = scratch();
                const { provider } = harness(worldPath);
                await provider.enable();
                provider.saveLevelData({ stems: { 'minecraft:overworld': flatOverworld } });
                provider.saveLevelData({
                    stems: { 'minecraft:overworld': noiseOverworld, 'minecraft:the_nether': noiseOverworld }
                });
                await provider.disable();

                const root = levelDat(worldPath);
                expect(root.getNumber('Generator', -1)).toBe(1);
                expect(root.has('FlatWorldLayers')).toBe(false);
            });

            it('writes the Nether scale it is given', async () => {
                const worldPath = scratch();
                const { provider } = harness(worldPath);
                await provider.enable();
                provider.saveLevelData({ netherScale: 3 });
                await provider.disable();

                expect(levelDat(worldPath).getNumber('NetherScale', -1)).toBe(3);
            });
        });

        it("writes a player's items as the Items NBT a vanilla tool reads", async () => {
            const worldPath = scratch();
            const { provider } = harness(worldPath);
            const empty = (size: number): (StoredItemStack | null)[] => new Array(size).fill(null);
            const slots = empty(36);
            slots[4] = {
                name: 'minecraft:diamond_sword',
                count: 1,
                damage: 12,
                customName: 'Biter',
                lore: ['One line'],
                enchantments: { 'minecraft:sharpness': 3, 'minecraft:sweeping_edge': 2 }
            };

            const data: WorldPlayerData = {
                username: 'Player',
                gamemode: 'Survival',
                position: { x: 0, y: 64, z: 0, pitch: 0, yaw: 0, headYaw: 0 },
                health: 14,
                food: 9,
                saturation: 2,
                experience: { level: 5, progress: 0.25 },
                inventory: {
                    items: slots,
                    handSlot: 4,
                    armor: empty(4),
                    offhand: empty(1),
                    enderChest: empty(27)
                }
            };

            await provider.enable();
            await provider.writePlayerData('items-xuid', data);
            await provider.disable();

            const database = await Database.open(path.join(worldPath, 'db'), { readOnly: true });
            const value = database.get(encodePlayerServerKey('items-xuid'));
            if (value === null) throw new Error('Expected player_server record');

            const reader = new NBTReader(new BinaryStream(value), ByteOrder.LITTLE_ENDIAN);
            reader.setUseVarint(false);
            const nbt = reader.parse();

            const stored = [...(nbt.getList('Inventory', false) ?? [])];
            expect(stored).toHaveLength(1);
            const sword = stored[0];
            if (!(sword instanceof NBTTagCompound)) throw new Error('Expected an item compound');

            expect(sword.getString('Name', '')).toBe('minecraft:diamond_sword');
            expect(sword.getByte('Count', 0)).toBe(1);
            expect(sword.getByte('Slot', -1)).toBe(4);
            expect(nbt.getNumber('SelectedInventorySlot', -1)).toBe(4);

            // Bedrock's own `ench` carries the two the client's registry lists, and Sweeping
            // Edge is not one of them - so the Java ids beside it are what makes it total.
            const tag = sword.getCompound('tag', false);
            expect(tag?.getNumber('Damage', 0)).toBe(12);
            expect([...(tag?.getList('ench', false) ?? [])]).toHaveLength(1);
            expect(tag?.getCompound('display', false)?.getString('Name', '')).toBe('Biter');
            await database.close();

            const reopened = harness(worldPath);
            await reopened.provider.enable();
            expect(await reopened.provider.readPlayerData('items-xuid')).toEqual(data);
            await reopened.provider.disable();
        });

        it('generates a chunk that is not there, and does not write one back for it', async () => {
            const { provider } = harness(scratch());
            await provider.enable();

            const gen = generator();
            const chunk = await provider.readChunk(Dimensions.Overworld, 0, 0, 1234n, gen);

            expect(gen.calls).toEqual([[0, 0]]);
            expect(chunk.getHasChanged()).toBe(false);
            await provider.disable();
        });

        describe('round trip', () => {
            it('does not save entities whose data says they are transient', async () => {
                const worldPath = scratch();
                let persistent = true;
                const transient = stub<Entity>({
                    getType: () => 'minecraft:fishing_hook',
                    getPosition: () => stub<Position>({ getX: () => 1, getY: () => 64, getZ: () => 1 }),
                    getTags: () => [],
                    getStatusEffects: () => [],
                    getPortalCooldown: () => 0,
                    getWorld: () => stub<World>({ getDimension: () => Dimensions.Overworld }),
                    shouldPersist: () => persistent,
                    yaw: 0,
                    pitch: 0
                });
                const first = harness(worldPath, 'testworld', 1234n, [transient]);
                await first.provider.enable();
                const chunk = buildChunk();
                await first.provider.writeChunk(chunk);
                persistent = false;
                await first.provider.writeChunk(chunk);
                await first.provider.disable();

                const reopened = harness(worldPath);
                await reopened.provider.enable();
                const restored = await reopened.provider.readChunk(Dimensions.Overworld, 0, 0, 1234n, generator());

                expect(restored.takeStoredEntities()).toEqual([]);
                await reopened.provider.disable();
            });

            it('reads back every block it wrote, across the full height', async () => {
                const worldPath = scratch();
                const first = harness(worldPath);
                await first.provider.enable();
                await first.provider.writeChunk(buildChunk());
                await first.provider.disable();

                const second = harness(worldPath);
                await second.provider.enable();
                const gen = generator();
                const restored = await second.provider.readChunk(Dimensions.Overworld, 0, 0, 1234n, gen);

                // Not regenerated: the chunk was found on disk.
                expect(gen.calls).toEqual([]);

                expect(restored.getBlockRuntimeId(3, -64, 4)).toBe(id('minecraft:bedrock'));
                expect(restored.getBlockRuntimeId(0, -62, 0)).toBe(id('minecraft:stone'));
                expect(restored.getBlockRuntimeId(8, 70, 9)).toBe(id('minecraft:oak_log'));
                expect(restored.getBlockRuntimeId(1, 310, 1)).toBe(id('minecraft:dirt'));
                expect(restored.getBlockRuntimeId(5, 200, 5)).toBe(id('minecraft:air'));
                await second.provider.disable();
            }, 15_000);

            it('keeps a block at y=-64 and one at y=310, which the old format could not hold', async () => {
                const worldPath = scratch();
                const { provider } = harness(worldPath);
                await provider.enable();
                await provider.writeChunk(buildChunk());
                await provider.disable();

                const reopened = harness(worldPath);
                await reopened.provider.enable();
                const restored = await reopened.provider.readChunk(Dimensions.Overworld, 0, 0, 1234n, generator());

                expect(restored.getMinY()).toBe(-64);
                expect(restored.getMaxY()).toBe(319);
                expect(restored.getBlockRuntimeId(3, -64, 4)).not.toBe(id('minecraft:air'));
                expect(restored.getBlockRuntimeId(1, 310, 1)).not.toBe(id('minecraft:air'));
                await reopened.provider.disable();
            });

            it('round-trips several chunks', async () => {
                const worldPath = scratch();
                const { provider } = harness(worldPath);
                await provider.enable();

                for (let cx = -2; cx <= 2; cx++) {
                    for (let cz = -2; cz <= 2; cz++) await provider.writeChunk(buildChunk(cx, cz));
                }

                await provider.disable();

                const reopened = harness(worldPath);
                await reopened.provider.enable();

                for (let cx = -2; cx <= 2; cx++) {
                    for (let cz = -2; cz <= 2; cz++) {
                        const restored = await reopened.provider.readChunk(
                            Dimensions.Overworld,
                            cx,
                            cz,
                            1234n,
                            generator()
                        );
                        expect(restored.getBlockRuntimeId(3, -64, 4)).toBe(id('minecraft:bedrock'));
                    }
                }

                await reopened.provider.disable();
            });

            it('round-trips block entities, including one it does not model', async () => {
                const worldPath = scratch();
                const { provider } = harness(worldPath);
                await provider.enable();

                const chunk = buildChunk();
                const blockEntities: Array<[string, number, number, number, (root: NBTTagCompound) => void]> = [
                    ['Chest', 1, 64, 1, (root) => root.addValue('Findable', new Types.ByteVal(1))],
                    ['Beacon', 2, 64, 2, (root) => root.addValue('primary', new Types.NumberVal(5))]
                ];
                for (const [id_, x, y, z, extra] of blockEntities) {
                    const nbt = new NBTTagCompound('');
                    nbt.addValue('id', new Types.StringVal(id_));
                    nbt.addValue('x', new Types.NumberVal(x));
                    nbt.addValue('y', new Types.NumberVal(y));
                    nbt.addValue('z', new Types.NumberVal(z));
                    extra(nbt);
                    chunk.setBlockEntity(BlockEntityRegistry.fromNBT(nbt));
                }

                await provider.writeChunk(chunk);
                await provider.disable();

                const reopened = harness(worldPath);
                await reopened.provider.enable();
                const restored = await reopened.provider.readChunk(Dimensions.Overworld, 0, 0, 1234n, generator());

                const chest = restored.getBlockEntity(1, 64, 1);
                const beacon = restored.getBlockEntity(2, 64, 2);

                expect(chest?.getId()).toBe('Chest');
                expect(beacon?.getId()).toBe('Beacon');
                // The unmodeled one kept its own fields.
                expect(beacon?.toNBT().getNumber('primary', 0)).toBe(5);
                await reopened.provider.disable();
            });

            it('round-trips the biomes a generator chose', async () => {
                const worldPath = scratch();
                const { provider } = harness(worldPath);
                await provider.enable();

                const chunk = buildChunk();
                const biomes = chunk.getBiomes();
                for (let x = 0; x < 16; x++) {
                    for (let z = 0; z < 16; z++) biomes.fillColumn(x, z, x < 8 ? DESERT : JUNGLE);
                }
                biomes.set(3, 70, 4, DEEP_DARK);

                await provider.writeChunk(chunk);
                await provider.disable();

                const reopened = harness(worldPath);
                await reopened.provider.enable();
                const restored = await reopened.provider.readChunk(Dimensions.Overworld, 0, 0, 1234n, generator());

                expect(restored.getBiome(0, 64, 0)).toBe(DESERT);
                expect(restored.getBiome(15, -64, 15)).toBe(JUNGLE);
                expect(restored.getBiome(3, 70, 4)).toBe(DEEP_DARK);
                await reopened.provider.disable();
            }, 15_000);

            it('writes the heightmap the Data3D record carries', async () => {
                const worldPath = scratch();
                const { provider } = harness(worldPath);
                await provider.enable();
                await provider.writeChunk(buildChunk());

                const biomes = provider.readBiomes(Dimensions.Overworld, 0, 0);
                // One past the highest block, measured from the floor: the dirt at y=310 of the
                // column at x=1, z=1 makes 310 + 1 + 64.
                expect(biomes?.heightmap[1 * 16 + 1]).toBe(375);
                // A column holding only the stone floor, whose top is y=-60.
                expect(biomes?.heightmap[0]).toBe(5);
                await provider.disable();
            });
        });

        describe('several dimensions in one save', () => {
            /** A chunk of one dimension with a stone floor at its own minimum y and a marker block. */
            const chunkIn = (dimension: DimensionType, cx = 0, cz = 0, marker = 'minecraft:oak_log'): Chunk => {
                const chunk = new Chunk(cx, cz, new Map(), dimension);
                for (let x = 0; x < 16; x++) {
                    for (let z = 0; z < 16; z++) {
                        chunk.fillColumn(x, z, dimension.minY, dimension.minY + 3, id('minecraft:stone'));
                    }
                }
                chunk.setBlockRuntimeId(1, dimension.minY + 40, 1, id(marker));
                return chunk;
            };

            it('keeps Overworld, Nether and End chunks at the same x,z apart', async () => {
                const worldPath = scratch();
                const { provider } = harness(worldPath);
                await provider.enable();
                await provider.writeChunk(chunkIn(Dimensions.Overworld, 0, 0, 'minecraft:oak_log'));
                await provider.writeChunk(chunkIn(Dimensions.Nether, 0, 0, 'minecraft:netherrack'));
                await provider.writeChunk(chunkIn(Dimensions.TheEnd, 0, 0, 'minecraft:end_stone'));
                await provider.disable();

                const reopened = harness(worldPath);
                await reopened.provider.enable();
                const gen = generator();
                const overworld = await reopened.provider.readChunk(Dimensions.Overworld, 0, 0, 1234n, gen);
                const nether = await reopened.provider.readChunk(Dimensions.Nether, 0, 0, 1234n, gen);
                const end = await reopened.provider.readChunk(Dimensions.TheEnd, 0, 0, 1234n, gen);

                // All three were on disk; none was regenerated.
                expect(gen.calls).toEqual([]);

                expect(overworld.getMinY()).toBe(-64);
                expect(nether.getMinY()).toBe(0);
                expect(nether.getMaxY()).toBe(127);
                expect(end.getMaxY()).toBe(255);

                expect(overworld.getBlockRuntimeId(1, -24, 1)).toBe(id('minecraft:oak_log'));
                expect(nether.getBlockRuntimeId(1, 40, 1)).toBe(id('minecraft:netherrack'));
                expect(end.getBlockRuntimeId(1, 40, 1)).toBe(id('minecraft:end_stone'));

                // The Nether's floor is at y 0; the Overworld has air there, and the End's marker
                // sits where the Nether has air.
                expect(overworld.getBlockRuntimeId(0, 0, 0)).toBe(id('minecraft:air'));
                expect(nether.getBlockRuntimeId(0, 0, 0)).toBe(id('minecraft:stone'));
                expect(nether.getBlockRuntimeId(1, 40, 1)).not.toBe(id('minecraft:end_stone'));
                await reopened.provider.disable();
            }, 15_000);

            it('writes 8, 16 and 24 biome sections into Data3D for the Nether, the End and the Overworld', async () => {
                const worldPath = scratch();
                const { provider } = harness(worldPath);
                await provider.enable();
                for (const dimension of [Dimensions.Overworld, Dimensions.Nether, Dimensions.TheEnd]) {
                    await provider.writeChunk(chunkIn(dimension));
                }

                const sections = (dimension: DimensionType) => provider.readBiomes(dimension, 0, 0)?.palettes.length;
                expect(sections(Dimensions.Nether)).toBe(8);
                expect(sections(Dimensions.TheEnd)).toBe(16);
                expect(sections(Dimensions.Overworld)).toBe(24);
                await provider.disable();

                const database = await Database.open(path.join(worldPath, 'db'), { readOnly: true });
                const data3d = (dimension: number) =>
                    database.get(encodeChunkKey({ x: 0, z: 0, dimension, tag: ChunkTag.Data3D }));
                // The three records are three keys: 9 bytes for the Overworld, 13 with a dimension.
                expect(data3d(0)).not.toBeNull();
                expect(data3d(1)).not.toBeNull();
                expect(data3d(2)).not.toBeNull();
                expect(data3d(1)?.equals(data3d(2) ?? Buffer.alloc(0))).toBe(false);
                await database.close();
            });

            it('stores a Nether sub chunk under a 14 byte key and never above index 7', async () => {
                const worldPath = scratch();
                const { provider } = harness(worldPath);
                await provider.enable();
                await provider.writeChunk(chunkIn(Dimensions.Nether));
                await provider.disable();

                const database = await Database.open(path.join(worldPath, 'db'), { readOnly: true });
                const subChunks = [...database.keys()]
                    .map((key) => decodeChunkKey(key))
                    .filter((key) => key?.tag === ChunkTag.SubChunkPrefix);

                expect(subChunks.every((key) => key?.dimension === 1)).toBe(true);
                expect(subChunks.map((key) => key?.subChunk).sort()).toEqual([0, 2]);
                // Nothing leaked into the Overworld's key space.
                expect([...database.keys()].filter((key) => key.byteLength === 9 || key.byteLength === 10)).toEqual([]);
                await database.close();
            });

            it('lists the chunks of one dimension only', async () => {
                const { provider } = harness(scratch());
                await provider.enable();
                await provider.writeChunk(chunkIn(Dimensions.Overworld, 0, 0));
                await provider.writeChunk(chunkIn(Dimensions.Overworld, 1, 1));
                await provider.writeChunk(chunkIn(Dimensions.Nether, 0, 0));
                await provider.writeChunk(chunkIn(Dimensions.Nether, -3, 2));
                await provider.writeChunk(chunkIn(Dimensions.TheEnd, 9, 9));

                const sorted = (chunks: Iterable<{ x: number; z: number }>) =>
                    [...chunks].sort((a, b) => a.x - b.x || a.z - b.z);

                expect(sorted(provider.listChunks(Dimensions.Overworld))).toEqual([
                    { x: 0, z: 0 },
                    { x: 1, z: 1 }
                ]);
                expect(sorted(provider.listChunks(Dimensions.Nether))).toEqual([
                    { x: -3, z: 2 },
                    { x: 0, z: 0 }
                ]);
                expect(sorted(provider.listChunks(Dimensions.TheEnd))).toEqual([{ x: 9, z: 9 }]);
                await provider.disable();
            });

            it('keeps a custom dimension at id 1000 apart from the Overworld and the Nether', async () => {
                // The first id a level hands a type without a Bedrock overlay. Its key carries
                // the int32 1000 where the Nether's carries 1, and its column is its own.
                const sky = dimensionTypeOf(
                    { ...VANILLA_DIMENSION_TYPES['minecraft:overworld'], minY: 0, height: 128 },
                    'mypack:sky',
                    FIRST_CUSTOM_DIMENSION_ID
                );
                const worldPath = scratch();
                const { provider } = harness(worldPath);
                await provider.enable();
                await provider.writeChunk(chunkIn(Dimensions.Overworld, 0, 0, 'minecraft:oak_log'));
                await provider.writeChunk(chunkIn(Dimensions.Nether, 0, 0, 'minecraft:netherrack'));
                await provider.writeChunk(chunkIn(sky, 0, 0, 'minecraft:glowstone'));
                await provider.writeChunk(chunkIn(sky, 4, -4, 'minecraft:glowstone'));
                await provider.disable();

                const reopened = harness(worldPath);
                await reopened.provider.enable();
                const gen = generator();
                const restored = await reopened.provider.readChunk(sky, 0, 0, 1234n, gen);
                const nether = await reopened.provider.readChunk(Dimensions.Nether, 0, 0, 1234n, gen);

                expect(gen.calls).toEqual([]);
                expect(restored.getDimension()).toBe(sky);
                expect(restored.getMinY()).toBe(0);
                expect(restored.getMaxY()).toBe(127);
                expect(restored.getBlockRuntimeId(1, 40, 1)).toBe(id('minecraft:glowstone'));
                expect(nether.getBlockRuntimeId(1, 40, 1)).toBe(id('minecraft:netherrack'));
                expect(reopened.provider.readBiomes(sky, 0, 0)?.palettes.length).toBe(8);

                const sorted = (chunks: Iterable<{ x: number; z: number }>) =>
                    [...chunks].sort((a, b) => a.x - b.x || a.z - b.z);
                expect(sorted(reopened.provider.listChunks(sky))).toEqual([
                    { x: 0, z: 0 },
                    { x: 4, z: -4 }
                ]);
                expect(sorted(reopened.provider.listChunks(Dimensions.Overworld))).toEqual([{ x: 0, z: 0 }]);
                expect(sorted(reopened.provider.listChunks(Dimensions.Nether))).toEqual([{ x: 0, z: 0 }]);
                await reopened.provider.disable();

                const database = await Database.open(path.join(worldPath, 'db'), { readOnly: true });
                const skyKeys = [...database.keys()].filter((key) => decodeChunkKey(key)?.dimension === 1000);
                expect(skyKeys.length).toBeGreaterThan(0);
                expect(skyKeys.every((key) => key.readInt32LE(8) === 1000)).toBe(true);
                await database.close();
            });

            it("writes a player's dimension and spawn dimension as Bedrock integers", async () => {
                const worldPath = scratch();
                const { provider } = harness(worldPath);
                const data: WorldPlayerData = {
                    username: 'Player',
                    gamemode: 'Survival',
                    position: { x: 0, y: 64, z: 0, pitch: 0, yaw: 0, headYaw: 0 },
                    dimension: 'minecraft:the_nether',
                    spawn: { x: 10, y: 64, z: -3, dimension: 'minecraft:the_end' },
                    savedAt: 1_700_000_000_000
                };

                await provider.enable();
                await provider.writePlayerData('player-xuid', data);
                expect(await provider.readPlayerData('player-xuid')).toEqual(data);
                await provider.disable();

                const database = await Database.open(path.join(worldPath, 'db'), { readOnly: true });
                const value = database.get(encodePlayerServerKey('player-xuid'));
                if (value === null) throw new Error('Expected player_server record');

                const reader = new NBTReader(new BinaryStream(value), ByteOrder.LITTLE_ENDIAN);
                reader.setUseVarint(false);
                const nbt = reader.parse();
                expect(nbt.getNumber('DimensionId', -1)).toBe(1);
                expect(nbt.getNumber('SpawnDimension', -1)).toBe(2);
                await database.close();
            });

            it("writes a custom dimension's integer from the level that owns the save", async () => {
                const worldPath = scratch();
                const { provider } = harness(worldPath);
                const sky = dimensionTypeOf(
                    { ...VANILLA_DIMENSION_TYPES['minecraft:overworld'], minY: 0, height: 128 },
                    'mypack:sky',
                    FIRST_CUSTOM_DIMENSION_ID
                );
                provider.setLevel(
                    fakeLevel({
                        dimensionTypes: new Map([
                            [Dimensions.Overworld.id, Dimensions.Overworld],
                            [sky.id, sky]
                        ])
                    })
                );
                const data: WorldPlayerData = {
                    username: 'Player',
                    gamemode: 'Survival',
                    position: { x: 0, y: 64, z: 0, pitch: 0, yaw: 0, headYaw: 0 },
                    dimension: 'mypack:sky',
                    spawn: { x: 10, y: 64, z: -3, dimension: 'mypack:sky' }
                };

                await provider.enable();
                await provider.writePlayerData('player-xuid', data);
                expect(await provider.readPlayerData('player-xuid')).toEqual(data);
                await provider.disable();

                const database = await Database.open(path.join(worldPath, 'db'), { readOnly: true });
                const value = database.get(encodePlayerServerKey('player-xuid'));
                if (value === null) throw new Error('Expected player_server record');

                const reader = new NBTReader(new BinaryStream(value), ByteOrder.LITTLE_ENDIAN);
                reader.setUseVarint(false);
                const nbt = reader.parse();
                expect(nbt.getNumber('DimensionId', -1)).toBe(1000);
                expect(nbt.getNumber('SpawnDimension', -1)).toBe(1000);
                await database.close();
            });

            it('lists an actor in a Nether chunk under the Nether digest only, with DimensionId 1', async () => {
                const worldPath = scratch();
                const netherWorld = stub<World>({ getDimension: () => Dimensions.Nether });
                const zombie = stub<Entity>({
                    getType: () => 'minecraft:zombified_piglin',
                    getPosition: () => stub<Position>({ getX: () => 5, getY: () => 40, getZ: () => 5 }),
                    getTags: () => [],
                    getStatusEffects: () => [],
                    getPortalCooldown: () => 0,
                    getWorld: () => netherWorld,
                    shouldPersist: () => true,
                    yaw: 0,
                    pitch: 0
                });
                const { provider } = harness(worldPath);
                provider.setEntitySource((dimension) => (dimension.bedrockId === 1 ? [zombie] : []));
                await provider.enable();
                await provider.writeChunk(chunkIn(Dimensions.Overworld));
                await provider.writeChunk(chunkIn(Dimensions.Nether));
                await provider.disable();

                const database = await Database.open(path.join(worldPath, 'db'), { readOnly: true });
                expect(database.get(encodeDigestKey(0, 0, 0))).toBeNull();
                const digest = database.get(encodeDigestKey(0, 0, 1));
                if (digest === null) throw new Error('Expected a Nether digest');
                const [actorId] = decodeDigest(digest);
                if (actorId === undefined) throw new Error('Expected one actor in the digest');
                const actor = database.get(encodeActorKey(actorId));
                if (actor === null) throw new Error('Expected the actor record');

                const reader = new NBTReader(new BinaryStream(actor), ByteOrder.LITTLE_ENDIAN);
                reader.setUseVarint(false);
                const nbt = reader.parse();
                expect(nbt.getString('identifier', '')).toBe('minecraft:zombified_piglin');
                expect(nbt.getNumber('DimensionId', -1)).toBe(1);
                await database.close();

                const reopened = harness(worldPath);
                await reopened.provider.enable();
                const overworld = await reopened.provider.readChunk(Dimensions.Overworld, 0, 0, 1234n, generator());
                const nether = await reopened.provider.readChunk(Dimensions.Nether, 0, 0, 1234n, generator());
                expect(overworld.takeStoredEntities()).toEqual([]);
                expect(nether.takeStoredEntities().map((entity) => entity.getNumber('DimensionId', -1))).toEqual([1]);
                await reopened.provider.disable();
            });

            it('generates a Nether chunk the save lacks even when the Overworld has one there', async () => {
                const { provider } = harness(scratch());
                await provider.enable();
                await provider.writeChunk(chunkIn(Dimensions.Overworld));

                const gen = generator();
                await provider.readChunk(Dimensions.Nether, 0, 0, 1234n, gen);

                expect(gen.calls).toEqual([[0, 0]]);
                await provider.disable();
            });
        });

        describe('what it stores', () => {
            it('writes the records a vanilla chunk has', async () => {
                const worldPath = scratch();
                const { provider } = harness(worldPath);
                await provider.enable();
                await provider.writeChunk(buildChunk());
                await provider.disable();

                const database = await Database.open(path.join(worldPath, 'db'), { readOnly: true });
                const key = (tag: ChunkTag, subChunk?: number) =>
                    encodeChunkKey({ x: 0, z: 0, dimension: 0, tag, subChunk });

                expect(database.get(key(ChunkTag.Version))).toEqual(Buffer.from([CHUNK_VERSION]));
                expect(database.get(key(ChunkTag.FinalizedState))?.readInt32LE(0)).toBe(2);
                expect(database.get(key(ChunkTag.Data3D))).not.toBeNull();
                // Sub chunk -4 holds the stone floor; 12 is empty and must not be stored.
                expect(database.get(key(ChunkTag.SubChunkPrefix, -4))).not.toBeNull();
                expect(database.get(key(ChunkTag.SubChunkPrefix, 12))).toBeNull();
                await database.close();
            });

            it('does not store an all-air sub chunk', async () => {
                const worldPath = scratch();
                const { provider } = harness(worldPath);
                await provider.enable();

                const chunk = new Chunk(0, 0, new Map(), Dimensions.Overworld);
                chunk.setBlockRuntimeId(0, 0, 0, id('minecraft:stone'));
                await provider.writeChunk(chunk);
                await provider.disable();

                const database = await Database.open(path.join(worldPath, 'db'), { readOnly: true });
                const subChunks = [...database.keys()].filter((key) => key.byteLength === 10);

                expect(subChunks).toHaveLength(1);
                await database.close();
            });

            it('marks a written chunk as saved so it is not written again', async () => {
                const { provider } = harness(scratch());
                await provider.enable();

                const chunk = buildChunk();
                expect(chunk.getHasChanged()).toBe(true);

                await provider.writeChunk(chunk);
                expect(chunk.getHasChanged()).toBe(false);
                await provider.disable();
            });
        });

        describe('safety', () => {
            it('warns rather than silently starting empty over an old Filesystem world', async () => {
                const worldPath = scratch();
                fs.mkdirSync(path.join(worldPath, 'chunks'));
                fs.writeFileSync(path.join(worldPath, 'chunks', '0_0.dat'), 'old world data');

                const { provider, warnings } = harness(worldPath);
                await provider.enable();
                await provider.disable();

                expect(warnings.join('\n')).toMatch(/Filesystem world/);
                // Nothing was destroyed.
                expect(fs.readFileSync(path.join(worldPath, 'chunks', '0_0.dat'), 'utf8')).toBe('old world data');
            });

            it('refuses a second provider on the same folder', async () => {
                const worldPath = scratch();
                const first = harness(worldPath);
                await first.provider.enable();

                const second = harness(worldPath);
                await expect(second.provider.enable()).rejects.toThrow(/already open/);
                await first.provider.disable();
            });
        });
    });
});
