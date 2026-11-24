import { mergeAtPath, parseNbtPath } from '@jsprismarine/nbt/path';
import { parseSnbt, parseSnbtCompound } from '@jsprismarine/nbt/snbt';
import { compoundTag, entryOf } from '@jsprismarine/nbt/tag';
import { describe, expect, it } from 'vitest';

import type { ContentItemDrop } from '../../content/world/adapter';
import { containerSlotsOf, stacksTag } from './stackNbt';

const shulker: ContentItemDrop = {
    identifier: 'minecraft:shulker_box',
    count: 1,
    canPlaceOn: ['minecraft:stone'],
    contents: [undefined, { identifier: 'minecraft:diamond', count: 4, customName: 'Shiny' }]
};

/** A chest's slots after `/data merge` writes `snbt` at the path `Items[<slot>]` of its tag. */
const mergeSlot = (before: readonly (ContentItemDrop | undefined)[], slot: number, snbt: string, size = 27) => {
    const root = compoundTag([['Items', stacksTag(before)]]);
    const edited = mergeAtPath(root, parseNbtPath(`Items[{Slot: ${slot}b}]`), parseSnbtCompound(snbt)).root;
    return containerSlotsOf(entryOf(edited.value, 'Items'), before, size);
};

describe('a container edited through its Items tag', () => {
    it('keeps a filled shulker box in another slot exactly as it was', () => {
        const before = [shulker, { identifier: 'minecraft:stone', count: 1 }];

        const after = mergeSlot(before, 1, '{count: 5}');

        expect(after[0]).toBe(shulker);
        expect(after[1]).toEqual({ identifier: 'minecraft:stone', count: 5 });
    });

    it("writes and reads a shulker box's contents as Java's container component", () => {
        const items = stacksTag([shulker]);

        expect(JSON.stringify(items)).toContain('minecraft:container');
        // A copy of the tag is a changed slot, so it is read back from the tag alone.
        const after = containerSlotsOf(items, [], 27);
        expect(after[0]?.contents?.[1]).toEqual({ identifier: 'minecraft:diamond', count: 4, customName: 'Shiny' });
    });

    it('fills an empty container up to its size, and drops a slot past it', () => {
        const items = parseSnbt(
            '[{Slot: 0b, id: "minecraft:stone", count: 2}, {Slot: 30b, id: "minecraft:dirt", count: 1}]'
        );

        const after = containerSlotsOf(items, [], 27);

        expect(after).toHaveLength(27);
        expect(after[0]).toEqual({ identifier: 'minecraft:stone', count: 2 });
        expect(after.filter((slot) => slot !== undefined)).toHaveLength(1);
    });
});
