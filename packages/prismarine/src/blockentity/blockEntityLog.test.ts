import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTTagCompound, NBTWriter, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import { BlockEntityRegistry } from './BlockEntityRegistry';
import { blockEntityChanges, withBlockEntityField } from './blockEntityLog';
import type { BlockEntityFieldChange } from './blockEntityLog';

const AT = { x: 3, y: 70, z: -2 };

/** A chest's tags as the chunk would serialize them, holding the given stacks by slot. */
const chest = (stacks: Record<number, [string, number]>, name?: string): NBTTagCompound => {
    const tags = new NBTTagCompound('');
    if (name !== undefined) tags.addValue('CustomName', new Types.StringVal(name));
    tags.addValue('id', new Types.StringVal('Chest'));
    tags.addValue('x', new Types.NumberVal(AT.x));
    tags.addValue('y', new Types.NumberVal(AT.y));
    tags.addValue('z', new Types.NumberVal(AT.z));
    const items = new Set<NBTTagCompound>();
    for (const [slot, [identifier, count]] of Object.entries(stacks)) {
        const stack = new NBTTagCompound('');
        stack.addValue('Name', new Types.StringVal(identifier));
        stack.addValue('Count', new Types.ByteVal(count));
        stack.addValue('Slot', new Types.ByteVal(Number(slot)));
        items.add(stack);
    }
    tags.addValue('Items', items);
    return BlockEntityRegistry.fromNBT(tags).toNBT();
};

/** Applies the inverses of `changes`, newest first, the way an undo does. */
const undo = (current: NBTTagCompound | null, changes: readonly BlockEntityFieldChange[]) =>
    changes.reduceRight<NBTTagCompound | null>(
        (tags, change) => withBlockEntityField(tags, AT, change.field, change.before),
        current
    );

/** Applies `changes` oldest first, the way a replay forward does. */
const redo = (current: NBTTagCompound | null, changes: readonly BlockEntityFieldChange[]) =>
    changes.reduce<NBTTagCompound | null>(
        (tags, change) => withBlockEntityField(tags, AT, change.field, change.after),
        current
    );

/** The bytes a block entity's tags serialize to, which is what the replay digest reads. */
const bytesOf = (tags: NBTTagCompound | null) => {
    if (tags === null) return null;
    const stream = new BinaryStream();
    new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN).writeCompound(BlockEntityRegistry.fromNBT(tags).toNBT());
    return stream.getBuffer().toString('hex');
};

describe('a block entity in the change log', () => {
    it('appears with its data first and then each slot', () => {
        const changes = blockEntityChanges(null, chest({ 4: ['minecraft:stone', 2], 1: ['minecraft:bread', 3] }));

        expect(changes.map(({ field }) => field)).toEqual(['data', 'items.1', 'items.4']);
        expect(changes.every(({ before }) => before === null)).toBe(true);
    });

    it('disappears with each slot first and its data last', () => {
        const changes = blockEntityChanges(chest({ 4: ['minecraft:stone', 2], 1: ['minecraft:bread', 3] }), null);

        expect(changes.map(({ field }) => field)).toEqual(['items.4', 'items.1', 'data']);
        expect(changes.every(({ after }) => after === null)).toBe(true);
    });

    it('changes only the slot a stack moved into', () => {
        const changes = blockEntityChanges(
            chest({ 1: ['minecraft:bread', 3] }),
            chest({ 1: ['minecraft:bread', 3], 6: ['minecraft:torch', 8] })
        );

        expect(changes).toEqual([{ field: 'items.6', before: null, after: expect.any(Uint8Array) }]);
    });

    it('changes only its data when a tag outside the stacks changes', () => {
        const changes = blockEntityChanges(
            chest({ 1: ['minecraft:bread', 3] }),
            chest({ 1: ['minecraft:bread', 3] }, 'Loot')
        );

        expect(changes.map(({ field }) => field)).toEqual(['data']);
    });

    it.each([
        ['a placement', null, chest({ 0: ['minecraft:bread', 3] })],
        ['a removal', chest({ 0: ['minecraft:bread', 3], 26: ['minecraft:stone', 64] }), null],
        [
            'a stack moved',
            chest({ 0: ['minecraft:bread', 3] }),
            chest({ 0: ['minecraft:bread', 1], 9: ['minecraft:bread', 2] })
        ],
        ['a renamed chest emptied', chest({ 2: ['minecraft:dirt', 5] }), chest({}, 'Empty')]
    ])('undoes %s back to the same bytes', (_name, before, after) => {
        expect(bytesOf(undo(after, blockEntityChanges(before, after)))).toEqual(bytesOf(before));
    });

    it('replays a change to a list that does not split, forward and back, to the same bytes', () => {
        const slotted = chest({ 0: ['minecraft:bread', 3], 4: ['minecraft:stone', 2] });
        const unslotted = chest({});
        const stack = new NBTTagCompound('');
        stack.addValue('Name', new Types.StringVal('minecraft:bread'));
        unslotted.addValue('Items', new Set([stack]));

        for (const [before, after] of [
            [slotted, unslotted],
            [unslotted, slotted]
        ] as const) {
            const changes = blockEntityChanges(before, after);
            expect(bytesOf(redo(before, changes))).toEqual(bytesOf(after));
            expect(bytesOf(undo(after, changes))).toEqual(bytesOf(before));
        }
    });

    it('keeps a list whose stacks name no slot whole in its data', () => {
        const tags = chest({});
        const stack = new NBTTagCompound('');
        stack.addValue('Name', new Types.StringVal('minecraft:bread'));
        tags.addValue('Items', new Set([stack]));

        expect(blockEntityChanges(null, tags).map(({ field }) => field)).toEqual(['data']);
    });
});
