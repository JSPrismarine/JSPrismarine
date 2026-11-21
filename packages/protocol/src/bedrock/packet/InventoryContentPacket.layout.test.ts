import BinaryStream from '@jsprismarine/binaryutils';
import { packetIds as packetIds2193 } from '../wire/versions/v2193';
import { packetIds as packetIds2225 } from '../wire/versions/v2225';
import { layoutAt } from '../../wire/WireLayout';
import { inventoryContentPacket } from '../wire/definitions/containers';
import { describe, expect, it } from 'vitest';
import { capture } from '../../testing/evidence.test.helper';

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

describe('InventoryContentPacket against the real server capture', () => {
    for (const protocol of [2193, 2225] as const) {
        const layout = layoutAt(inventoryContentPacket, protocol);

        it(`re-encodes the Bedrock Dedicated Server payload byte for byte at ${protocol}`, () => {
            const bytes = capture(protocol, 0x31);
            const read = layout.decode(new BinaryStream(bytes));

            // The `Dynamic ID` presence byte is on the wire at both versions, so it is not a gate.
            expect(read.fullContainerName).toEqual({ containerId: 0, dynamicId: null });
            expect(read.slots).toHaveLength(36);

            const stream = new BinaryStream();
            layout.encode(stream, read);
            expect(stream.getBuffer()).toEqual(bytes);
        });
    }

    it('carries the Dynamic ID as an unsigned 32-bit value', () => {
        const stream = new BinaryStream();
        const layout = layoutAt(inventoryContentPacket, 2225);
        const sent = { ...payload, fullContainerName: { containerId: 63, dynamicId: 0xffffffff } };
        layout.encode(stream, sent);

        expect(layout.decode(new BinaryStream(stream.getBuffer()))).toEqual(sent);
    });

    it('is packet 0x31 at both protocol versions', () => {
        expect(packetIds2193.InventoryContentPacket).toBe(0x31);
        expect(packetIds2225.InventoryContentPacket).toBe(0x31);
    });
});
