import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import RequestNetworkSettingsPacket from './RequestNetworkSettingsPacket';

/** Protocol 2193 on the wire, header included. */
const BYTES = Buffer.from([
    0xc1, // packet id 193 as a varuint, first byte
    0x01, // and its second
    0x00, // ClientNetworkVersion 2193, a big-endian int32: 0x00000891. Little endian would
    0x00, // put the 0x91 first and a server would read a protocol in the billions.
    0x08,
    0x91
]);

describe('RequestNetworkSettingsPacket', () => {
    it('writes ClientNetworkVersion as a big-endian int32 and nothing else', () => {
        const buffer = new RequestNetworkSettingsPacket({ protocolVersion: 2193 }).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new RequestNetworkSettingsPacket().deserialize(stream);

        expect(data).toEqual({ protocolVersion: 2193 });
        expect(stream.feof()).toBe(true);
    });

    it('uses packet id 193', () => {
        expect(new RequestNetworkSettingsPacket().id).toBe(193);
    });
});
