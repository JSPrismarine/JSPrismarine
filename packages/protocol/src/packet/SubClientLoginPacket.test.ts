import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import SubClientLoginPacket from './SubClientLoginPacket';

import type { SubClientLogin } from './SubClientLoginPacket';

const DATA: SubClientLogin = { chainData: '{}', clientData: 'x' };
const BYTES = Buffer.from([0x5e, 0x0b, 0x02, 0x00, 0x00, 0x00, 0x7b, 0x7d, 0x01, 0x00, 0x00, 0x00, 0x78]);
const PADDED_BYTES = Buffer.from([0x5e, 0x0c, ...BYTES.subarray(2), 0x00]);

describe('SubClientLoginPacket', () => {
    it('writes the nested connection request with its two length-prefixed strings', () => {
        expect(new SubClientLoginPacket(DATA).serialize(new NetworkBinaryStream())).toEqual(BYTES);
    });

    it('reads both strings to the end of the packet', () => {
        const stream = new NetworkBinaryStream(BYTES);

        expect(new SubClientLoginPacket().deserialize(stream)).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('rejects bytes left after the client data', () => {
        expect(() => new SubClientLoginPacket().deserialize(new NetworkBinaryStream(PADDED_BYTES))).toThrow(
            /1 unread bytes/
        );
    });
});
