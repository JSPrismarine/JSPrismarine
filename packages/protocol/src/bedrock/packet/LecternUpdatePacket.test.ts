import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../../NetworkBinaryStream';
import BlockPos from '../structure/BlockPos';
import LecternUpdatePacket from './LecternUpdatePacket';

describe('LecternUpdatePacket', () => {
    const bytes = Buffer.from([0x7d, 0x02, 0x05, 0x02, 0x80, 0x01, 0x05]);
    const payload = { newPage: 2, totalPages: 5, position: new BlockPos(1, 64, -3) };

    it.each([2193, 2225])('round-trips the same bytes at protocol %i', (protocol) => {
        const decoded = new LecternUpdatePacket();
        decoded.codecProtocol = protocol;
        expect(decoded.deserialize(new NetworkBinaryStream(bytes))).toEqual(payload);

        const encoded = new LecternUpdatePacket(payload);
        encoded.codecProtocol = protocol;
        expect(encoded.serialize(new NetworkBinaryStream())).toEqual(bytes);
    });

    it('decodes the pages and signed block position, consuming the whole buffer', () => {
        const stream = new NetworkBinaryStream(bytes);

        expect(new LecternUpdatePacket().deserialize(stream)).toEqual(payload);
        expect(stream.feof()).toBe(true);
    });

    it('encodes the same bytes', () => {
        expect(new LecternUpdatePacket(payload).serialize(new NetworkBinaryStream())).toEqual(bytes);
    });
});
