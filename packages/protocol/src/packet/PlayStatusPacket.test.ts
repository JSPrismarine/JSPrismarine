import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import PlayStatusPacket, { PlayStatus } from './PlayStatusPacket';

describe('PlayStatusPacket', () => {
    it('writes the status as a big-endian int32 and nothing else', () => {
        const buffer = new PlayStatusPacket({ status: PlayStatus.PlayerSpawn }).serialize(new NetworkBinaryStream());

        expect([...buffer.subarray(1)]).toEqual([0x00, 0x00, 0x00, 0x03]); // after the packet id header
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(Buffer.from([0x02, 0x00, 0x00, 0x00, 0x07]));
        const data = new PlayStatusPacket().deserialize(stream);

        expect(data).toEqual({ status: PlayStatus.LoginFailedServerFull });
        expect(stream.feof()).toBe(true);
    });
});
