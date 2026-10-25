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

        it('reads back every block it was given', () => {
            const storage = new BlockStorage({});
            storage.setBlock(1, 2, 3, stone());
            storage.setBlock(15, 15, 15, dirt());

            expect(storage.getRuntimeId(1, 2, 3)).toBe(stone());
            expect(storage.getRuntimeId(15, 15, 15)).toBe(dirt());
            expect(storage.getRuntimeId(0, 0, 0)).toBe(air());
        });

        it('keeps the 4096 indices in a packed array rather than a plain one', () => {
            // A plain array of 4096 small integers costs 8 bytes each in V8; a full Overworld
            // column of them retained about 1000 KiB, against 166 KiB packed.
            const storage = new BlockStorage({ blocks: new Uint16Array(4096), palette: [air()] });

            const blocks: unknown = Reflect.get(storage, 'blocks');
            expect(blocks).toBeInstanceOf(Uint16Array);
            expect((blocks as Uint16Array).byteLength).toBe(8192);
        });

        it('copies the indices it is given, so the caller may reuse its buffer', () => {
            const indices = new Uint16Array(4096);
            indices[0] = 1;

            const storage = new BlockStorage({ blocks: indices, palette: [air(), stone()] });
            indices[0] = 0;

            expect(storage.getRuntimeId(0, 0, 0)).toBe(stone());
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
        });
    });
});
