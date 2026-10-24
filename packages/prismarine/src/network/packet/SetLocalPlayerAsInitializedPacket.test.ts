import { describe, expect, it } from 'vitest';
import SetLocalPlayerAsInitializedPacket from './SetLocalPlayerAsInitializedPacket';

describe('SetLocalPlayerAsInitializedPacket', () => {
    it('decodes the runtime id as a varuint64, consuming the whole buffer', () => {
        // Header: id 113 is 0x71. Runtime id 300 is 0xac 0x02.
        const packet = new SetLocalPlayerAsInitializedPacket(Buffer.from([0x71, 0xac, 0x02]));
        packet.decode();

        expect(packet.runtimeEntityId).toBe(300n);
        expect(packet.feof()).toBe(true);
    });

    it('reads a runtime id past the 32 bit range', () => {
        // 2^33 as LEB128: 0x80 0x80 0x80 0x80 0x20.
        const packet = new SetLocalPlayerAsInitializedPacket(Buffer.from([0x71, 0x80, 0x80, 0x80, 0x80, 0x20]));
        packet.decode();

        expect(packet.runtimeEntityId).toBe(8589934592n);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes it decodes', () => {
        const packet = new SetLocalPlayerAsInitializedPacket();
        packet.runtimeEntityId = 300n;
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([0x71, 0xac, 0x02]));
    });
});
