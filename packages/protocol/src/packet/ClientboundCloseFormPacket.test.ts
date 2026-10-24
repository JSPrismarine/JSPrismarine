import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import ClientboundCloseFormPacket from './ClientboundCloseFormPacket';

/** The whole packet: id 310 as a two-byte varuint32 header and nothing after it. */
const BYTES = Buffer.from([0xb6, 0x02]);

describe('ClientboundCloseFormPacket', () => {
    it('writes id 310 and no payload', () => {
        const buffer = new ClientboundCloseFormPacket({}).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a bare header to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new ClientboundCloseFormPacket().deserialize(stream);

        expect(data).toEqual({});
        expect(stream.feof()).toBe(true);
    });
});
