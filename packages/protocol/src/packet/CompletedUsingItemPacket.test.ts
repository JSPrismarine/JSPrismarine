import { describe, expect, it } from 'vitest';

import CompletedUsingItemPacket, { ItemUseMethod } from './CompletedUsingItemPacket';

// Packet id 142 as a varuint.
const HEADER = [0x8e, 0x01];

describe('CompletedUsingItemPacket', () => {
    it('writes the item id as an int16 and the use method as an int32, both little-endian', () => {
        const packet = new CompletedUsingItemPacket();
        packet.itemId = 373;
        packet.itemUseMethod = ItemUseMethod.Eat;
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([...HEADER, 0x75, 0x01, 0x01, 0x00, 0x00, 0x00]));
    });

    it('reads a negative item id and the use method, consuming the whole buffer', () => {
        const packet = new CompletedUsingItemPacket();
        packet.setReadBuffer(Buffer.from([...HEADER, 0xff, 0xff, 0x0b, 0x00, 0x00, 0x00]));
        packet.decode();

        expect(packet.itemId).toBe(-1);
        expect(packet.itemUseMethod).toBe(ItemUseMethod.Interact);
        expect(packet.feof()).toBe(true);
    });

    it('reads the Unknown method, which the snapshot numbers -1', () => {
        const packet = new CompletedUsingItemPacket();
        packet.setReadBuffer(Buffer.from([...HEADER, 0x75, 0x01, 0xff, 0xff, 0xff, 0xff]));
        packet.decode();

        expect(packet.itemUseMethod).toBe(ItemUseMethod.Unknown);
        expect(packet.feof()).toBe(true);
    });
});
