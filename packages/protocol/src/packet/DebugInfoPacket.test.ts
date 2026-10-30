import { describe, expect, it } from 'vitest';

import DebugInfoPacket from './DebugInfoPacket';

// Packet id 155 as a varuint.
const HEADER = [0x9b, 0x01];

describe('DebugInfoPacket', () => {
    it('writes the actor id as a ZigZag varint64 then the length prefixed data', () => {
        const packet = new DebugInfoPacket();
        packet.actorId = 1234n;
        packet.data = 'hello';
        packet.encode();

        // 1234 ZigZag encoded is 2468, which is 0xa4 0x13 as LEB128.
        expect(packet.getBuffer()).toEqual(Buffer.from([...HEADER, 0xa4, 0x13, 0x05, ...Buffer.from('hello', 'utf8')]));
    });

    it('reads a negative actor id and empty data, consuming the whole buffer', () => {
        const packet = new DebugInfoPacket();
        packet.setReadBuffer(Buffer.from([...HEADER, 0x01, 0x00]));
        packet.decode();

        expect(packet.actorId).toBe(-1n);
        expect(packet.data).toBe('');
        expect(packet.feof()).toBe(true);
    });
});
