import { describe, expect, it } from 'vitest';
import MapCreateLockedCopyPacket from './MapCreateLockedCopyPacket';

const ENCODED = Buffer.concat([
    Buffer.from([0x83, 0x01]), // Header: id 131 as LEB128.
    Buffer.from([0x02]), // Original Map Id 1 as a ZigZag varint64.
    Buffer.from([0x05]) // New Map Id -3 as a ZigZag varint64.
]);

describe('MapCreateLockedCopyPacket', () => {
    it('encodes both map ids as ZigZag varint64', () => {
        const packet = Object.assign(new MapCreateLockedCopyPacket(), { originalMapId: 1n, newMapId: -3n });
        packet.encode();

        expect(packet.getBuffer()).toEqual(ENCODED);
    });

    it('decodes both map ids and consumes the whole buffer', () => {
        const packet = new MapCreateLockedCopyPacket(ENCODED);
        packet.decode();

        expect(packet.originalMapId).toBe(1n);
        expect(packet.newMapId).toBe(-3n);
        expect(packet.feof()).toBe(true);
    });
});
