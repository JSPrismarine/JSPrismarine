import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTReader, NBTTagCompound, NBTWriter, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import { BlockEntityRegistry } from './BlockEntityRegistry';
import {
    applyBlockEntityRecord,
    blockEntityCompound,
    blockEntityIdFor,
    blockEntityRecord,
    CONTENT_DATA_TAG
} from './contentRecord';

/** The disk codec the LevelDB provider uses for a chunk's block entities, both ways. */
const throughDisk = (nbt: NBTTagCompound): NBTTagCompound => {
    const stream = new BinaryStream();
    const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
    writer.setUseVarint(false);
    writer.writeCompound(nbt);

    const reader = new NBTReader(new BinaryStream(stream.getBuffer()), ByteOrder.LITTLE_ENDIAN);
    reader.setUseVarint(false);
    return reader.parse();
};

describe('blockEntityIdFor', () => {
    it('names a modeled type the way vanilla spells it', () => {
        expect(blockEntityIdFor('minecraft:chest')).toBe('Chest');
        expect(blockEntityIdFor('minecraft:mob_spawner')).toBe('MobSpawner');
        expect(blockEntityIdFor('minecraft:shulker_box')).toBe('ShulkerBox');
    });

    it('namespaces a type the server does not model rather than guessing a vanilla name', () => {
        expect(blockEntityIdFor('minecraft:chiseled_bookshelf')).toBe('jsprismarine:chiseled_bookshelf');
    });
});

describe('block entity records', () => {
    it('round-trips a container through the compound a chunk saves', () => {
        const nbt = blockEntityCompound(null, { x: 4, y: 64, z: 4 }, 'minecraft:chest');
        applyBlockEntityRecord(nbt, {
            capacity: 27,
            items: [{ identifier: 'minecraft:stick', count: 3 }, undefined, { identifier: 'minecraft:stone', count: 1 }]
        });

        const restored = blockEntityRecord(throughDisk(nbt));

        expect(restored.capacity).toBe(27);
        expect(restored.items).toEqual([
            { identifier: 'minecraft:stick', count: 3 },
            undefined,
            { identifier: 'minecraft:stone', count: 1 },
            ...new Array<undefined>(24).fill(undefined)
        ]);
    });

    it('keeps the fields Bedrock has no tag for', () => {
        const nbt = blockEntityCompound(null, { x: 0, y: 0, z: 0 }, 'minecraft:chest');
        applyBlockEntityRecord(nbt, { capacity: 27, items: [], pairedWith: { x: 5, y: 64, z: 4 }, sealed: true });

        const restored = blockEntityRecord(throughDisk(nbt));

        expect(restored['pairedWith']).toEqual({ x: 5, y: 64, z: 4 });
        expect(restored.sealed).toBe(true);
    });

    it('reads a container a vanilla world wrote, which lists only its filled slots', () => {
        const nbt = new NBTTagCompound('');
        nbt.addValue('id', new Types.StringVal('Chest'));

        const stack = new NBTTagCompound('');
        stack.addValue('Name', new Types.StringVal('minecraft:diamond'));
        stack.addValue('Count', new Types.ByteVal(64));
        stack.addValue('Slot', new Types.ByteVal(2));
        nbt.addValue('Items', new Set([stack]));

        const record = blockEntityRecord(nbt);

        expect(record.items).toEqual([undefined, undefined, { identifier: 'minecraft:diamond', count: 64 }]);
        expect(record.capacity).toBeUndefined();
    });

    it('leaves the tags it does not model where it found them', () => {
        const nbt = blockEntityCompound(null, { x: 1, y: 2, z: 3 }, 'minecraft:furnace');
        nbt.addValue('BurnTime', new Types.ShortVal(120));
        applyBlockEntityRecord(nbt, { capacity: 3, items: [] });

        // Through the class the registry picks for the id, which is what a chunk files.
        const filed = BlockEntityRegistry.fromNBT(throughDisk(nbt));

        expect(filed.getId()).toBe('Furnace');
        expect(filed.toNBT().getShort('BurnTime', 0)).toBe(120);
        expect(blockEntityRecord(filed.toNBT()).capacity).toBe(3);
    });

    it('drops the record tag when nothing is left to store in it', () => {
        const nbt = blockEntityCompound(null, { x: 0, y: 0, z: 0 }, 'minecraft:chest');
        applyBlockEntityRecord(nbt, { capacity: 27 });
        expect(nbt.has(CONTENT_DATA_TAG)).toBe(true);

        applyBlockEntityRecord(nbt, {});
        expect(nbt.has(CONTENT_DATA_TAG)).toBe(false);
        expect(nbt.has('Items')).toBe(false);
    });
});
