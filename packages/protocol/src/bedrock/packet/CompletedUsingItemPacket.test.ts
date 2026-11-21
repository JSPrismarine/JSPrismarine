import { describe, expect, it } from 'vitest';

import CompletedUsingItemPacket, { ItemUseMethod } from './CompletedUsingItemPacket';
import { enumDumpMembers } from '../../testing/evidence.test.helper';

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

    it('numbers ItemUseMethod as the pinned Mojang enums.html does', () => {
        // The pages for protocols 2193 and 2225 list the field as a bare int32, and no capture of
        // this packet exists, so the pinned 1.26.40 dump is the evidence for the members.
        const values = enumDumpMembers('ItemUseMethod')
            .filter(({ name }) => name !== '_Count')
            .map(({ name, value }) => [name, value] as const);
        const ours = Object.entries(ItemUseMethod)
            .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
            .map(([name, value]) => [name, value] as const);

        expect(values.length).toBeGreaterThan(0);
        expect(ours).toEqual(values);
    });

    it('writes the same bytes at 2193 and 2225, which differ in no field', () => {
        const at = (protocol: number): number[] => {
            const packet = new CompletedUsingItemPacket();
            packet.codecProtocol = protocol;
            packet.itemId = 373;
            packet.itemUseMethod = ItemUseMethod.Eat;
            packet.encode();
            return [...packet.getBuffer()];
        };

        expect(at(2225)).toEqual(at(2193));
    });
});
