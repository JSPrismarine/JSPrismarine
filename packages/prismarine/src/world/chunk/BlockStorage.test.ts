import { describe, expect, it } from 'vitest';

import BinaryStream from '@jsprismarine/binaryutils';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import BlockStorage from './BlockStorage';
import { decodePersistentStorage, encodePersistentStorage } from '../providers/leveldb/PersistentBlockStorage';

const air = () => BlockRuntimeIds.getByName('minecraft:air');
const stone = () => BlockRuntimeIds.getByName('minecraft:stone');
const dirt = () => BlockRuntimeIds.getByName('minecraft:dirt');

describe('world', () => {
    describe('BlockStorage', () => {
        it('starts as a sub chunk of air', () => {
            const storage = new BlockStorage({});

            expect(storage.getRuntimeId(0, 0, 0)).toBe(air());
            expect(storage.isEmpty()).toBe(true);
        });

        it('does not treat a uniform non-air palette as empty', () => {
            const water = BlockRuntimeIds.getByName('minecraft:water');
            const storage = new BlockStorage({ palette: [water] });

            expect(storage.getRuntimeId(0, 0, 0)).toBe(water);
            expect(storage.isEmpty()).toBe(false);
        });

        it('becomes empty when its last non-air block is replaced by air', () => {
            const storage = new BlockStorage({});
            storage.setBlock(1, 2, 3, stone());
            storage.setBlock(1, 2, 3, air());

            expect(storage.isEmpty()).toBe(true);
        });

        it('reads back every block it was given', () => {
            const storage = new BlockStorage({});
            storage.setBlock(1, 2, 3, stone());
            storage.setBlock(15, 15, 15, dirt());

            expect(storage.getRuntimeId(1, 2, 3)).toBe(stone());
            expect(storage.getRuntimeId(15, 15, 15)).toBe(dirt());
            expect(storage.getRuntimeId(0, 0, 0)).toBe(air());
        });

        it('stores palettes of at most 256 entries in a byte array', () => {
            const storage = new BlockStorage({ blocks: new Uint16Array(4096), palette: [air()] });

            const blocks: unknown = Reflect.get(storage, 'blocks');
            expect(blocks).toBeInstanceOf(Uint8Array);
            expect((blocks as Uint8Array).byteLength).toBe(4096);
        });

        it('copies the indices it is given, so the caller may reuse its buffer', () => {
            const indices = new Uint16Array(4096);
            indices[0] = 1;

            const storage = new BlockStorage({ blocks: indices, palette: [air(), stone()] });
            indices[0] = 0;

            expect(storage.getRuntimeId(0, 0, 0)).toBe(stone());
        });

        it('widens to sixteen bits when adding a 257th palette entry', () => {
            const storage = new BlockStorage({ palette: Array.from({ length: 256 }, () => stone()) });
            expect(Reflect.get(storage, 'blocks')).toBeInstanceOf(Uint8Array);

            storage.pack();
            expect(storage.getIndexStorageByteLength()).toBe(4096);
            storage.setBlock(1, 2, 3, dirt());

            expect(storage.getIndexStorageByteLength()).toBe(8192);
            expect(storage.getPaletteIndexAt(1, 2, 3)).toBe(256);
            expect(storage.getRuntimeId(1, 2, 3)).toBe(dirt());
        });

        it('preserves unused palette entries and repeated indices when interning a uniform section', () => {
            const storage = new BlockStorage({
                blocks: new Uint8Array(4096).fill(1),
                palette: [air(), stone(), dirt()]
            });
            const networkBefore = new BinaryStream();
            storage.networkSerialize(networkBefore);
            const persistentBefore = new BinaryStream();
            encodePersistentStorage(storage, persistentBefore);

            storage.pack();

            const networkAfter = new BinaryStream();
            storage.networkSerialize(networkAfter);
            const persistentAfter = new BinaryStream();
            encodePersistentStorage(storage, persistentAfter);
            expect(networkAfter.getBuffer()).toEqual(networkBefore.getBuffer());
            expect(persistentAfter.getBuffer()).toEqual(persistentBefore.getBuffer());
            expect(storage.getPalette()).toEqual([air(), stone(), dirt()]);
            expect(storage.getPaletteIndexAt(1, 2, 3)).toBe(1);
        });

        it('reads palette slots by their XZY linear index', () => {
            const storage = new BlockStorage({});
            storage.setBlock(1, 2, 3, dirt());

            expect(storage.getPaletteIndexAtIndex(0x132)).toBe(storage.getPaletteIndexAt(1, 2, 3));
        });

        it('round trips through the network form', () => {
            const storage = new BlockStorage({});
            storage.setBlock(4, 5, 6, stone());
            storage.setBlock(7, 8, 9, dirt());

            const stream = new BinaryStream();
            storage.networkSerialize(stream);

            const read = BlockStorage.networkDeserialize(new BinaryStream(stream.getBuffer()));
            expect(read.getRuntimeId(4, 5, 6)).toBe(stone());
            expect(read.getRuntimeId(7, 8, 9)).toBe(dirt());
            expect(read.getRuntimeId(0, 0, 0)).toBe(air());
            expect(Reflect.get(read, 'blocks')).toBeInstanceOf(Uint8Array);
        });

        it('uses sixteen-bit indices when decoding a wide network palette', () => {
            const palette = Array.from({ length: 257 }, (_unused, index) => (index % 2 === 0 ? stone() : dirt()));
            const indices = Uint16Array.from({ length: 4096 }, (_unused, index) => index % 257);
            const source = new BlockStorage({ blocks: indices, palette });
            const stream = new BinaryStream();
            source.networkSerialize(stream);

            const restored = BlockStorage.networkDeserialize(new BinaryStream(stream.getBuffer()));
            expect(Reflect.get(restored, 'blocks')).toBeInstanceOf(Uint16Array);
            expect(restored.getRuntimeId(0, 1, 0)).toBe(palette[1]);
        });

        it('uses zero-bit network storage for uniform air and non-air palettes', () => {
            const water = BlockRuntimeIds.getByName('minecraft:water');

            for (const runtimeId of [air(), water]) {
                const storage = new BlockStorage({ palette: [runtimeId] });
                const stream = new BinaryStream();
                storage.networkSerialize(stream);

                expect(stream.getBuffer()[0]).toBe(1);
                const restored = BlockStorage.networkDeserialize(new BinaryStream(stream.getBuffer()));
                expect(restored.getRuntimeId(0, 0, 0)).toBe(runtimeId);
                expect(restored.getRuntimeId(15, 15, 15)).toBe(runtimeId);
            }
        });

        it('writes a zero-bit network storage as its header and one runtime id, with no palette count', () => {
            // A count there is what the client then reads as the runtime id, and every byte after
            // it is misread: a uniform sub chunk made the whole SubChunkPacket a bad packet.
            const water = BlockRuntimeIds.getByName('minecraft:water');
            const storage = new BlockStorage({ palette: [water] });
            const written = new BinaryStream();
            storage.networkSerialize(written);

            const expected = new BinaryStream();
            expected.writeByte(1);
            expected.writeVarInt(water);
            expect(written.getBuffer()).toStrictEqual(expected.getBuffer());
        });

        it('reads the storage after a zero-bit one from where the zero-bit one ends', () => {
            const water = BlockRuntimeIds.getByName('minecraft:water');
            const mixed = new BlockStorage({ palette: [air()] });
            mixed.setBlock(3, 4, 5, stone());
            const stream = new BinaryStream();
            new BlockStorage({ palette: [water] }).networkSerialize(stream);
            mixed.networkSerialize(stream);

            const reader = new BinaryStream(stream.getBuffer());
            const first = BlockStorage.networkDeserialize(reader);
            const second = BlockStorage.networkDeserialize(reader);

            expect(first.getRuntimeId(15, 15, 15)).toBe(water);
            expect([second.getRuntimeId(3, 4, 5), second.getRuntimeId(0, 0, 0)]).toStrictEqual([stone(), air()]);
            expect(reader.getReadIndex()).toBe(stream.getBuffer().byteLength);
        });

        it('round trips every supported palette bit width in network and persistent storage', () => {
            const paletteSizes = [1, 2, 3, 5, 9, 17, 33, 65, 257];
            const runtimeId = stone();

            for (const paletteSize of paletteSizes) {
                const indices = Uint16Array.from({ length: 4096 }, (_unused, index) => index % paletteSize);
                const storage = new BlockStorage({
                    blocks: indices,
                    palette: Array.from({ length: paletteSize }, () => runtimeId)
                });
                const expectedBits = paletteSize <= 1 ? 0 : Math.ceil(Math.log2(paletteSize));
                const bedrockBits = expectedBits === 7 || expectedBits === 8 ? 8 : expectedBits > 8 ? 16 : expectedBits;
                const currentNetwork = new BinaryStream();
                storage.networkSerialize(currentNetwork);
                const currentPersistent = new BinaryStream();
                encodePersistentStorage(storage, currentPersistent);

                storage.pack();
                const network = new BinaryStream();
                storage.networkSerialize(network);
                expect(network.getBuffer()).toEqual(currentNetwork.getBuffer());

                expect(network.getBuffer()[0]).toBe((bedrockBits << 1) | 1);
                const decodedNetwork = BlockStorage.networkDeserialize(new BinaryStream(network.getBuffer()));
                for (const index of [0, 1, 15, 255, 4095]) {
                    const x = index >> 8;
                    const z = (index >> 4) & 0xf;
                    const y = index & 0xf;
                    expect(decodedNetwork.getRuntimeId(x, y, z)).toBe(runtimeId);
                }

                const persistent = new BinaryStream();
                encodePersistentStorage(storage, persistent);
                const persistentBytes = persistent.getBuffer();
                expect(persistentBytes).toEqual(currentPersistent.getBuffer());
                const decodedPersistent = decodePersistentStorage(new BinaryStream(persistentBytes));
                const persistentRoundTrip = new BinaryStream();
                encodePersistentStorage(decodedPersistent, persistentRoundTrip);

                expect(persistentBytes[0]).toBe(bedrockBits << 1);
                expect(persistentRoundTrip.getBuffer()).toEqual(persistentBytes);
            }
        });

        it('drops palette entries that no block uses during network serialization', () => {
            const indices = new Uint16Array(4096);
            indices[15] = 2;
            indices[31] = 3;
            const palette = [air(), stone(), dirt(), BlockRuntimeIds.getByName('minecraft:water')];
            const storage = new BlockStorage({ blocks: indices, palette });
            const stream = new BinaryStream();
            storage.networkSerialize(stream);

            const restored = BlockStorage.networkDeserialize(new BinaryStream(stream.getBuffer()));
            expect(restored.getPalette()).toEqual([air(), dirt(), BlockRuntimeIds.getByName('minecraft:water')]);
            expect(restored.getRuntimeId(0, 0, 0)).toBe(air());
            expect(restored.getRuntimeId(0, 15, 0)).toBe(dirt());
            expect(restored.getRuntimeId(0, 15, 1)).toBe(BlockRuntimeIds.getByName('minecraft:water'));
        });
    });
});
