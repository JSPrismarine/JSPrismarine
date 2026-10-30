import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt } from '../wire/WireLayout';
import { inventorySlotPacket } from '../wire/definitions/containers';
import { describe, expect, it } from 'vitest';

/** An empty stack: every field zero, and a blob with no length. */
const emptyStack = { id: 0, stackSize: 0, auxValue: 0, stackNetId: null, blockRuntimeId: 0, userData: Buffer.alloc(0) };

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the layout.
 * One case per branch of `Full Container Name`: no dynamic id and an empty stack, then a
 * dynamic id and a tracked stack.
 */
const CASES = [
    {
        name: 'an emptied crafting slot, with no dynamic id',
        bytes: Buffer.from('7c1d010d00000000000000000000', 'hex'),
        payload: {
            windowId: 124,
            inventorySlot: 29,
            fullContainerName: { containerId: 13, dynamicId: null },
            storageItem: null,
            item: emptyStack
        }
    },
    {
        name: 'a tracked stack in a dynamic container',
        bytes: Buffer.from('071a01070111000000000500030000012ab6b5ac94070a00000000000000000000', 'hex'),
        payload: {
            windowId: 7,
            inventorySlot: 26,
            fullContainerName: { containerId: 7, dynamicId: 17 },
            storageItem: null,
            item: {
                id: 5,
                stackSize: 3,
                auxValue: 0,
                stackNetId: 21,
                blockRuntimeId: 1921718966,
                userData: Buffer.alloc(10)
            }
        }
    }
] as const;

describe('the declarative InventorySlot layout', () => {
    const layout = layoutAt(inventorySlotPacket, 2193);

    for (const { name, bytes, payload } of CASES) {
        it(`writes the bytes the hand-written encoder wrote for ${name}`, () => {
            const stream = new BinaryStream();
            layout.encode(stream, payload);

            expect(stream.getBuffer()).toEqual(bytes);
        });

        it(`reads those bytes back for ${name}`, () => {
            expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
        });
    }

    it('reads an absent Full Container Name, which the old encoder never wrote', () => {
        const absent = Buffer.from('7c1d00000000000000000000', 'hex');

        expect(layout.decode(new BinaryStream(absent))).toEqual({
            windowId: 124,
            inventorySlot: 29,
            fullContainerName: null,
            storageItem: null,
            item: emptyStack
        });
    });
});
