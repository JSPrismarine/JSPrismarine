import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import ServerStatsPacket from './ServerStatsPacket';

import type { ServerStats } from './ServerStatsPacket';

/** Both values are exact in a 32-bit float, so the round trip compares equal. */
const DATA: ServerStats = {
    serverTime: 12.5,
    networkTime: 0.5
};

/** `DATA` on the wire, header bytes included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xc0, 0x01], // packet id header, 192 as a varuint32
    ...[0x00, 0x00, 0x48, 0x41], // ServerTime 12.5, little-endian float (0x41480000)
    ...[0x00, 0x00, 0x00, 0x3f] // NetworkTime 0.5, little-endian float (0x3f000000)
]);

describe('ServerStatsPacket', () => {
    it('writes both timings as little-endian floats', () => {
        const buffer = new ServerStatsPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new ServerStatsPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });
});
