import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import ResourcePacksReadyForValidationPacket from './ResourcePacksReadyForValidationPacket';

/** The whole packet: id 340 as a two-byte varuint32 header and nothing after it. */
const BYTES = Buffer.from([0xd4, 0x02]);

describe('ResourcePacksReadyForValidationPacket', () => {
    it('writes id 340 and no payload', () => {
        const buffer = new ResourcePacksReadyForValidationPacket({}).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a bare header to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new ResourcePacksReadyForValidationPacket().deserialize(stream);

        expect(data).toEqual({});
        expect(stream.feof()).toBe(true);
    });
});
