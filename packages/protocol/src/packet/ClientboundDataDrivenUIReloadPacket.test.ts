import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import ClientboundDataDrivenUIReloadPacket from './ClientboundDataDrivenUIReloadPacket';

/** The whole packet: 335 as a varuint32 header and nothing after it. */
const BYTES = Buffer.from([0xcf, 0x02]);

describe('ClientboundDataDrivenUIReloadPacket', () => {
    it('writes id 335 and no payload', () => {
        const buffer = new ClientboundDataDrivenUIReloadPacket({}).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a bare header to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new ClientboundDataDrivenUIReloadPacket().deserialize(stream);

        expect(data).toStrictEqual({});
        expect(stream.feof()).toBe(true);
    });
});
