import { describe, expect, it } from 'vitest';

import BinaryStream from '@jsprismarine/binaryutils';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import BlockStorage from './BlockStorage';

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

            storage.setBlock(1, 2, 3, dirt());

            expect(Reflect.get(storage, 'blocks')).toBeInstanceOf(Uint16Array);
            expect(storage.getPaletteIndexAt(1, 2, 3)).toBe(256);
            expect(storage.getRuntimeId(1, 2, 3)).toBe(dirt());
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
