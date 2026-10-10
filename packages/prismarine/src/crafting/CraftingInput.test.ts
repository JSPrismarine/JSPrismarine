import { describe, expect, it } from 'vitest';

import { Item } from '../item/Item';
import CraftingInput from './CraftingInput';

/**
 * The client does not number the crafting grid from zero.
 *
 * The inventory's four slots are 28 to 31 and a crafting table's nine are 32 to 40, both
 * inside the one crafting container. This store read them as "the first four" and the handler
 * rejected anything above eight, so every slot a real client named was refused - which is the
 * whole of why nothing could be crafted, in the inventory or at a table.
 * @see https://github.com/pmmp/BedrockProtocol/blob/35.0.0%2Bbedrock-1.21.40/src/types/inventory/UIInventorySlotOffset.php
 */
describe('CraftingInput', () => {
    const planks = () => new Item({ id: 0, name: 'minecraft:oak_planks' });

    describe('locate', () => {
        it('maps the inventory grid, which starts at 28', () => {
            expect(CraftingInput.locate(28)).toEqual({ index: 0, size: CraftingInput.SMALL });
            expect(CraftingInput.locate(31)).toEqual({ index: 3, size: CraftingInput.SMALL });
        });

        it('maps a crafting table, which starts at 32', () => {
            expect(CraftingInput.locate(32)).toEqual({ index: 0, size: CraftingInput.LARGE });
            expect(CraftingInput.locate(40)).toEqual({ index: 8, size: CraftingInput.LARGE });
        });

        it('refuses a slot that is in neither grid', () => {
            // Nought is the cursor, and the numbers this used to accept.
            expect(CraftingInput.locate(0)).toBeNull();
            expect(CraftingInput.locate(27)).toBeNull();
            expect(CraftingInput.locate(41)).toBeNull();
            expect(CraftingInput.locate(1.5)).toBeNull();
        });
    });

    describe('gridSize', () => {
        it('is the grid the client reached into, not a guess from how full it is', () => {
            const input = new CraftingInput();
            input.useGrid(CraftingInput.LARGE);
            input.set(0, planks());

            // One item in the top left is a three by three when the client said so, and
            // inferring from fullness would have called it a two by two.
            expect(input.gridSize()).toBe(CraftingInput.LARGE);
        });

        it('reads larger than it was told rather than hiding an item', () => {
            // Erring upwards still matches; erring downwards matches the wrong recipe.
            const input = new CraftingInput();
            input.useGrid(CraftingInput.SMALL);
            input.set(8, planks());

            expect(input.gridSize()).toBe(CraftingInput.LARGE);
        });
    });

    describe('wireSlotOf', () => {
        it('gives back the number the client knows the slot by', () => {
            // A response naming index 0 points the client at its cursor, not at the grid.
            const small = new CraftingInput();
            small.useGrid(CraftingInput.SMALL);
            expect(small.wireSlotOf(0)).toBe(28);
            expect(small.wireSlotOf(3)).toBe(31);

            const large = new CraftingInput();
            large.useGrid(CraftingInput.LARGE);
            expect(large.wireSlotOf(0)).toBe(32);
            expect(large.wireSlotOf(8)).toBe(40);
        });

        it('round-trips whatever locate read', () => {
            for (const wire of [28, 29, 30, 31, 32, 36, 40]) {
                const located = CraftingInput.locate(wire)!;
                const input = new CraftingInput();
                input.useGrid(located.size);

                expect(input.wireSlotOf(located.index)).toBe(wire);
            }
        });
    });
});
