import BinaryStream from '@jsprismarine/binaryutils';
import { inventoryContentPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/** An empty stack: every field zero, and a blob with no length. */
const emptyStack = { id: 0, stackSize: 0, auxValue: 0, stackNetId: null, blockRuntimeId: 0, userData: Buffer.alloc(0) };

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the layout.
 * One tracked stack and one empty slot, in a container with a dynamic id.
 */
const BYTES = Buffer.from(
    '030205000c0000010eb6b5ac94070a0000000000000000000000000000000000003f01040302010000000000000000',
    'hex'
);

const payload = {
    windowId: 3,
    slots: [
        {
            id: 5,
            stackSize: 12,
            auxValue: 0,
            stackNetId: 7,
            blockRuntimeId: 1921718966,
            userData: Buffer.alloc(10)
        },
        emptyStack
    ],
    fullContainerName: { containerId: 63, dynamicId: 0x01020304 },
    storageItem: emptyStack
};

describe('the declarative InventoryContent layout', () => {
    const layout = layoutAt(inventoryContentPacket, 2193);

    it('writes the bytes the hand-written encoder wrote', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(BYTES);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(BYTES))).toEqual(payload);
    });
});
