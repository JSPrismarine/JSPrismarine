import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import RefreshEntitlementsPacket from './RefreshEntitlementsPacket';

/** The whole packet: id 305 as a two-byte varuint32 header and nothing after it. */
const BYTES = Buffer.from([0xb1, 0x02]);

describe('RefreshEntitlementsPacket', () => {
    it('writes id 305 and no payload', () => {
        const buffer = new RefreshEntitlementsPacket({}).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a bare header to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new RefreshEntitlementsPacket().deserialize(stream);

        expect(data).toEqual({});
        expect(stream.feof()).toBe(true);
    });
});
