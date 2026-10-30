import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import BlockPos from '../structure/BlockPos';
import LecternUpdatePacket from './LecternUpdatePacket';

describe('LecternUpdatePacket', () => {
    const bytes = Buffer.from([0x7d, 0x02, 0x05, 0x02, 0x80, 0x01, 0x05]);
    const payload = { newPage: 2, totalPages: 5, position: new BlockPos(1, 64, -3) };

    it('decodes the pages and signed block position, consuming the whole buffer', () => {
        const stream = new NetworkBinaryStream(bytes);

        expect(new LecternUpdatePacket().deserialize(stream)).toEqual(payload);
        expect(stream.feof()).toBe(true);
    });

    it('encodes the same bytes', () => {
        expect(new LecternUpdatePacket(payload).serialize(new NetworkBinaryStream())).toEqual(bytes);
    });
});
