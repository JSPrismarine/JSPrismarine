import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import ClientToServerHandshakePacket from './ClientToServerHandshakePacket';

/** The whole packet: the id header and nothing after it. */
const BYTES = Buffer.from([0x04]);

describe('ClientToServerHandshakePacket', () => {
    it('writes id 4 and no payload', () => {
        const buffer = new ClientToServerHandshakePacket({}).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a bare header to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new ClientToServerHandshakePacket().deserialize(stream);

        expect(data).toEqual({});
        expect(stream.feof()).toBe(true);
    });
});
