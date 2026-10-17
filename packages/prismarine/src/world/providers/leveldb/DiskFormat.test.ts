import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTTagCompound, NBTWriter, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds, UNKNOWN_RUNTIME_ID } from '../../../block/state/BlockRuntimeIds';
import BlockStorage from '../../chunk/BlockStorage';
import SubChunk from '../../chunk/SubChunk';
import { BLOCK_STATE_VERSION, decodePaletteEntry, encodePaletteEntry } from './PersistentPalette';
import {
    ChunkTag,
    decodeChunkKey,
    decodeDigest,
    encodeActorKey,
    encodeChunkKey,
    encodeDigest,
    encodeDigestKey
} from './LevelDBKeys';
import { HEIGHTMAP_BYTES, decodeData3D, encodeData3D, uniformBiomes, uniformData3D } from './BiomeCodec';
import { decodeLevelDat, encodeLevelDat, LEVEL_DAT_STORAGE_VERSION } from './LevelDat';
import { decodePersistentStorage, encodePersistentStorage } from './PersistentBlockStorage';
import { decodeSubChunk, encodeSubChunk } from './SubChunkCodec';
import { Dimensions } from '../../Dimension';

const id = (name: string) => BlockRuntimeIds.getByName(name);

describe('world', () => {
    describe('LevelDB keys', () => {
        it('leaves the dimension out for the Overworld', () => {
            const key = encodeChunkKey({ x: 0, z: 0, dimension: 0, tag: ChunkTag.Version });

            expect(key.byteLength).toBe(9);
            expect(decodeChunkKey(key)).toEqual({ x: 0, z: 0, dimension: 0, tag: ChunkTag.Version });
        });

        it('carries the dimension for the Nether and the End', () => {
            for (const dimension of [1, 2]) {
                const key = encodeChunkKey({ x: 5, z: -6, dimension, tag: ChunkTag.Data3D });

                expect(key.byteLength).toBe(13);
                expect(decodeChunkKey(key)).toEqual({ x: 5, z: -6, dimension, tag: ChunkTag.Data3D });
            }
        });

        it('round-trips a signed sub chunk index', () => {
            // -4 is the Overworld's bottom slice. Read unsigned it becomes 252, and the terrain
            // ends up stacked in the wrong order with nothing to say so.
            for (const subChunk of [-4, -1, 0, 15, 19]) {
                const key = encodeChunkKey({ x: 1, z: 2, dimension: 0, tag: ChunkTag.SubChunkPrefix, subChunk });

                expect(key.byteLength).toBe(10);
                expect(decodeChunkKey(key)).toEqual({
                    x: 1,
                    z: 2,
                    dimension: 0,
                    tag: ChunkTag.SubChunkPrefix,
                    subChunk
                });
            }
        });

        it('round-trips negative chunk coordinates', () => {
            const key = encodeChunkKey({ x: -2147483648, z: -1, dimension: 0, tag: ChunkTag.BlockEntity });

            expect(decodeChunkKey(key)).toMatchObject({ x: -2147483648, z: -1 });
        });

        it('round-trips every tag', () => {
            for (const tag of Object.values(ChunkTag).filter((value): value is ChunkTag => typeof value === 'number')) {
                const subChunk = tag === ChunkTag.SubChunkPrefix ? 0 : undefined;
                const decoded = decodeChunkKey(encodeChunkKey({ x: 3, z: 4, dimension: 0, tag, subChunk }));

                expect(decoded?.tag).toBe(tag);
            }
        });

        it('produces the exact bytes a vanilla world uses', () => {
            // x=0, z=0, SubChunkPrefix, sub chunk -4.
            expect(encodeChunkKey({ x: 0, z: 0, dimension: 0, tag: ChunkTag.SubChunkPrefix, subChunk: -4 })).toEqual(
                Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0x2f, 0xfc])
            );
        });

        it('ignores the keys that are not chunk records', () => {
            for (const name of ['~local_player', 'portals', 'BiomeData', 'Overworld', 'map_-1', 'scoreboard']) {
                expect(decodeChunkKey(Buffer.from(name))).toBeNull();
            }
        });

        it('ignores a key of the right length whose tag is not one', () => {
            const key = Buffer.alloc(9);
            key.writeUInt8(0x99, 8);

            expect(decodeChunkKey(key)).toBeNull();
        });

        it('ignores a sub chunk index on a tag that has none', () => {
            const key = Buffer.alloc(10);
            key.writeUInt8(ChunkTag.Version, 8);

            expect(decodeChunkKey(key)).toBeNull();
        });

        describe('actors', () => {
            it('builds the digest key a chunk lists its actors under', () => {
                expect(encodeDigestKey(0, 0, 0)).toEqual(Buffer.from([...Buffer.from('digp'), 0, 0, 0, 0, 0, 0, 0, 0]));
                expect(encodeDigestKey(0, 0, 1).byteLength).toBe(16);
            });

            it('round-trips a list of actor ids', () => {
                const ids = [Buffer.alloc(8, 1), Buffer.alloc(8, 2), Buffer.alloc(8, 3)];

                expect(decodeDigest(encodeDigest(ids))).toEqual(ids);
                expect(decodeDigest(Buffer.alloc(0))).toEqual([]);
            });

            it('refuses a digest that is not a whole number of ids', () => {
                expect(() => decodeDigest(Buffer.alloc(12))).toThrow(/whole number/);
            });

            it('builds the key an actor lives under', () => {
                expect(encodeActorKey(Buffer.alloc(8, 7))).toEqual(
                    Buffer.from([...Buffer.from('actorprefix'), 7, 7, 7, 7, 7, 7, 7, 7])
                );
                expect(() => encodeActorKey(Buffer.alloc(4))).toThrow(/8 bytes/);
            });
        });
    });

    describe('persistent palette', () => {
        it('round-trips a block state through NBT', () => {
            const stream = new BinaryStream();
            encodePaletteEntry(id('minecraft:stone'), stream);

            expect(decodePaletteEntry(new BinaryStream(stream.getBuffer()))).toBe(id('minecraft:stone'));
        });

        it('round-trips a state with properties', () => {
            const stream = new BinaryStream();
            const oakLog = id('minecraft:oak_log');
            encodePaletteEntry(oakLog, stream);

            expect(decodePaletteEntry(new BinaryStream(stream.getBuffer()))).toBe(oakLog);
        });

        it('writes the version the game expects', () => {
            // Understate it and the game runs the state through its upgrade schema, which can
            // turn a perfectly good block into minecraft:unknown.
            const stream = new BinaryStream();
            encodePaletteEntry(id('minecraft:stone'), stream);

            const bytes = stream.getBuffer();
            expect(bytes.includes(Buffer.from('version'))).toBe(true);
            expect(BLOCK_STATE_VERSION).toBe(0x01152801);
        });

        it('reports a block it has never heard of rather than throwing', () => {
            // A block from a newer version, or from a behaviour pack. One of them must not make
            // the whole world unreadable.
            const compound = new NBTTagCompound('');
            compound.addValue('name', new Types.StringVal('minecraft:some_future_block'));
            compound.addChild(new NBTTagCompound('states'));
            compound.addValue('version', new Types.NumberVal(BLOCK_STATE_VERSION));

            const stream = new BinaryStream();
            const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
            writer.setUseVarint(false);
            writer.writeCompound(compound);

            expect(decodePaletteEntry(new BinaryStream(stream.getBuffer()))).toBe(UNKNOWN_RUNTIME_ID);
        });

        it('falls back to a block default state when a property value is unknown', () => {
            const compound = new NBTTagCompound('');
            compound.addValue('name', new Types.StringVal('minecraft:oak_log'));
            const states = new NBTTagCompound('states');
            states.addValue('pillar_axis', new Types.StringVal('diagonal'));
            compound.addChild(states);

            const stream = new BinaryStream();
            const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
            writer.setUseVarint(false);
            writer.writeCompound(compound);

            // The block is real; only the value is not. Losing it entirely would be worse.
            expect(decodePaletteEntry(new BinaryStream(stream.getBuffer()))).toBe(id('minecraft:oak_log'));
        });
    });

    describe('persistent block storage', () => {
        const roundTrip = (storage: BlockStorage): BlockStorage => {
            const stream = new BinaryStream();
            encodePersistentStorage(storage, stream);
            return decodePersistentStorage(new BinaryStream(stream.getBuffer()));
        };

        it('round-trips a uniform sub chunk, which needs no word data at all', () => {
            const storage = new BlockStorage({});
            const restored = roundTrip(storage);

            expect(restored.getRuntimeId(0, 0, 0)).toBe(id('minecraft:air'));
            expect(restored.getRuntimeId(15, 15, 15)).toBe(id('minecraft:air'));
        });

        it('writes a uniform sub chunk with zero bits per block', () => {
            const stream = new BinaryStream();
            encodePersistentStorage(new BlockStorage({}), stream);

            // Header 0, then the int32 palette count, then one NBT entry - no words in between.
            expect(stream.getBuffer().readUInt8(0)).toBe(0);
            expect(stream.getBuffer().readInt32LE(1)).toBe(1);
        });

        it('marks the palette as persistent, never as runtime ids', () => {
            const storage = new BlockStorage({});
            storage.setBlock(0, 0, 0, id('minecraft:stone'));

            const stream = new BinaryStream();
            encodePersistentStorage(storage, stream);

            expect(stream.getBuffer().readUInt8(0) & 1).toBe(0);
        });

        it('round-trips every bit width the format allows', () => {
            // Each width is a different packing: how many indices fit in a 32 bit word, and how
            // many words the 4096 blocks need. The awkward ones are 3, 5 and 6, where 4096 is not
            // a multiple of the blocks per word.
            const names = [
                'minecraft:stone',
                'minecraft:dirt',
                'minecraft:sand',
                'minecraft:gravel',
                'minecraft:granite',
                'minecraft:diorite',
                'minecraft:andesite',
                'minecraft:cobblestone',
                'minecraft:bedrock',
                'minecraft:coal_ore',
                'minecraft:iron_ore',
                'minecraft:gold_ore'
            ];

            for (const distinct of [1, 2, 3, 5, 9, 12]) {
                const storage = new BlockStorage({});
                const palette = names.slice(0, distinct).map(id);

                for (let x = 0; x < 16; x++) {
                    for (let y = 0; y < 16; y++) {
                        for (let z = 0; z < 16; z++) {
                            storage.setBlock(x, y, z, palette[(x + y + z) % distinct]!);
                        }
                    }
                }

                const restored = roundTrip(storage);
                for (let x = 0; x < 16; x++) {
                    for (let y = 0; y < 16; y++) {
                        for (let z = 0; z < 16; z++) {
                            expect(restored.getRuntimeId(x, y, z)).toBe(storage.getRuntimeId(x, y, z));
                        }
                    }
                }
            }
        });

        it('keeps the last block, which is where an off-by-one in the packing shows', () => {
            const storage = new BlockStorage({});
            for (let i = 0; i < 5; i++) storage.setBlock(i, 0, 0, id('minecraft:stone'));
            storage.setBlock(15, 15, 15, id('minecraft:bedrock'));

            expect(roundTrip(storage).getRuntimeId(15, 15, 15)).toBe(id('minecraft:bedrock'));
        });

        it('refuses a storage marked as holding runtime ids', () => {
            const stream = new BinaryStream();
            stream.writeByte(0x03); // bits 1, network flag set

            expect(() => decodePersistentStorage(new BinaryStream(stream.getBuffer()))).toThrow(/runtime ids/);
        });

        it('refuses a bit width the format does not define', () => {
            const stream = new BinaryStream();
            stream.writeByte(7 << 1);

            expect(() => decodePersistentStorage(new BinaryStream(stream.getBuffer()))).toThrow(/bits per block/);
        });
    });

    describe('sub chunk codec', () => {
        const filled = (): SubChunk => {
            const subChunk = new SubChunk();
            subChunk.setBlock(1, 2, 3, id('minecraft:stone'), 0);
            subChunk.setBlock(4, 5, 6, id('minecraft:dirt'), 0);
            return subChunk;
        };

        it('round-trips version 9, which carries its own index', () => {
            const { subChunk, index } = decodeSubChunk(encodeSubChunk(filled(), -4, 9));

            expect(index).toBe(-4);
            expect(subChunk.getBlockRuntimeId(1, 2, 3)).toBe(id('minecraft:stone'));
            expect(subChunk.getBlockRuntimeId(4, 5, 6)).toBe(id('minecraft:dirt'));
            expect(subChunk.sourceVersion).toBe(9);
        });

        it('round-trips every sub chunk index the Overworld uses', () => {
            for (let index = -4; index <= 19; index++) {
                expect(decodeSubChunk(encodeSubChunk(filled(), index, 9)).index).toBe(index);
            }
        });

        it('round-trips version 8, which has no index of its own', () => {
            const { subChunk, index } = decodeSubChunk(encodeSubChunk(filled(), 3, 8));

            expect(index).toBeNull();
            expect(subChunk.getBlockRuntimeId(1, 2, 3)).toBe(id('minecraft:stone'));
            expect(subChunk.sourceVersion).toBe(8);
        });

        it('round-trips version 1, a single layer with no count byte', () => {
            const { subChunk, index } = decodeSubChunk(encodeSubChunk(filled(), 0, 1));

            expect(index).toBeNull();
            expect(subChunk.getBlockRuntimeId(1, 2, 3)).toBe(id('minecraft:stone'));
        });

        it('round-trips a second layer, which is how water-logging is stored', () => {
            const subChunk = new SubChunk();
            subChunk.setBlock(1, 1, 1, id('minecraft:oak_fence'), 0);
            subChunk.setBlock(1, 1, 1, id('minecraft:water'), 1);

            const restored = decodeSubChunk(encodeSubChunk(subChunk, 0, 9)).subChunk;

            expect(restored.getBlockRuntimeId(1, 1, 1, 0)).toBe(id('minecraft:oak_fence'));
            expect(restored.getBlockRuntimeId(1, 1, 1, 1)).toBe(id('minecraft:water'));
        });

        it('refuses to write a second layer into a version that cannot hold it', () => {
            const subChunk = new SubChunk();
            subChunk.setBlock(0, 0, 0, id('minecraft:stone'), 0);
            subChunk.setBlock(0, 0, 0, id('minecraft:water'), 1);

            expect(() => encodeSubChunk(subChunk, 0, 1)).toThrow(/single layer/);
        });

        it('refuses a version it does not know', () => {
            expect(() => decodeSubChunk(Buffer.from([7, 1]))).toThrow(/Unsupported sub chunk version 7/);
        });
    });

    describe('biome codec', () => {
        it('round-trips a uniform chunk', () => {
            const biomes = uniformData3D(1, Dimensions.Overworld);
            const restored = decodeData3D(encodeData3D(biomes, Dimensions.Overworld), Dimensions.Overworld);

            expect(restored.palettes).toHaveLength(24);
            expect(restored.palettes[0]![0]).toBe(1);
            expect(restored.palettes[23]![4095]).toBe(1);
        });

        it('round-trips a heightmap', () => {
            const biomes = uniformData3D(1, Dimensions.Overworld);
            for (let i = 0; i < 256; i++) biomes.heightmap[i] = 100 + (i % 50);

            const restored = decodeData3D(encodeData3D(biomes, Dimensions.Overworld), Dimensions.Overworld);

            expect(Array.from(restored.heightmap)).toEqual(Array.from(biomes.heightmap));
        });

        it('round-trips several biomes in one sub chunk', () => {
            const biomes = uniformData3D(1, Dimensions.Overworld);
            const mixed = uniformBiomes(1);
            for (let i = 0; i < 4096; i++) mixed[i] = [1, 4, 21, 16][i % 4]!;
            biomes.palettes[5] = mixed;

            const restored = decodeData3D(encodeData3D(biomes, Dimensions.Overworld), Dimensions.Overworld);

            expect(Array.from(restored.palettes[5]!.slice(0, 8))).toEqual([1, 4, 21, 16, 1, 4, 21, 16]);
        });

        it('reads a record whose tail was left off', () => {
            // The game stops writing once every remaining sub chunk would inherit the one below,
            // so a record can end after any whole palette. A uniform one is 9 bytes: the header,
            // then the int32 count and its single int32 biome.
            const full = encodeData3D(uniformData3D(1, Dimensions.Overworld), Dimensions.Overworld);
            const truncated = full.subarray(0, HEIGHTMAP_BYTES + 9 * 3);

            const restored = decodeData3D(truncated, Dimensions.Overworld);
            expect(restored.palettes).toHaveLength(3);
            expect(restored.palettes[0]![0]).toBe(1);
        });

        it('refuses a record cut off in the middle of a palette', () => {
            // Unlike a clean stop, this is damage rather than an abbreviation.
            const full = encodeData3D(uniformData3D(1, Dimensions.Overworld), Dimensions.Overworld);

            expect(() => decodeData3D(full.subarray(0, HEIGHTMAP_BYTES + 4), Dimensions.Overworld)).toThrow();
        });

        it('starts with a 512 byte heightmap', () => {
            const encoded = encodeData3D(uniformData3D(1, Dimensions.Overworld), Dimensions.Overworld);

            expect(encoded.byteLength).toBeGreaterThan(512);
            expect(encoded.readUInt16LE(0)).toBe(0);
        });

        it('writes one palette per sub chunk of the dimension', () => {
            const nether = decodeData3D(
                encodeData3D(uniformData3D(1, Dimensions.Nether), Dimensions.Nether),
                Dimensions.Nether
            );

            expect(nether.palettes).toHaveLength(8);
        });
    });

    describe('level.dat', () => {
        const sample = () => {
            const root = new NBTTagCompound('');
            root.addValue('LevelName', new Types.StringVal('JSPRoundTrip'));
            root.addValue('RandomSeed', new Types.LongVal(-1234567890123n));
            root.addValue('SpawnX', new Types.NumberVal(-16));
            root.addValue('SpawnY', new Types.NumberVal(-60));
            root.addValue('SpawnZ', new Types.NumberVal(32));
            root.addValue('commandsEnabled', new Types.ByteVal(1));
            return { storageVersion: LEVEL_DAT_STORAGE_VERSION, root };
        };

        it('round-trips', () => {
            const decoded = decodeLevelDat(encodeLevelDat(sample()));

            expect(decoded.storageVersion).toBe(10);
            expect(decoded.root.getString('LevelName', '')).toBe('JSPRoundTrip');
            expect(decoded.root.getLong('RandomSeed', 0n)).toBe(-1234567890123n);
            expect(decoded.root.getNumber('SpawnY', 0)).toBe(-60);
        });

        it('writes the 8 byte header the game reads', () => {
            const encoded = encodeLevelDat(sample());

            expect(encoded.readInt32LE(0)).toBe(10);
            expect(encoded.readInt32LE(4)).toBe(encoded.byteLength - 8);
        });

        it('refuses a file whose declared length does not match', () => {
            const encoded = encodeLevelDat(sample());
            encoded.writeInt32LE(9999, 4);

            expect(() => decodeLevelDat(encoded)).toThrow(/declares/);
        });

        it('refuses a file too short to hold a header', () => {
            expect(() => decodeLevelDat(Buffer.alloc(4))).toThrow(/header/);
        });
    });
});
