import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../../NetworkBinaryStream';
import BlockPos from '../structure/BlockPos';
import BlockEventPacket from './BlockEventPacket';

import type { BlockEvent } from './BlockEventPacket';

const DATA: BlockEvent = { blockPosition: new BlockPos(1, 2, 3), eventType: 1, eventValue: -1 };
const BYTES = Buffer.from([0x1a, 0x02, 0x04, 0x06, 0x02, 0x01]);

describe('BlockEventPacket', () => {
    it('writes the block position and block-defined event pair', () => {
        const buffer = new BlockEventPacket(DATA).serialize(new NetworkBinaryStream());

        expect(buffer).toEqual(BYTES);
    });

    it('reads a hand-built event to the end of the packet', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new BlockEventPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it.each([2193, 2225])('writes and reads the same bytes at protocol %i', (protocol) => {
        const packet = new BlockEventPacket(DATA);
        packet.codecProtocol = protocol;
        const written = packet.serialize(new NetworkBinaryStream());

        expect(written).toEqual(BYTES);

        const reader = new BlockEventPacket();
        reader.codecProtocol = protocol;

        expect(reader.deserialize(new NetworkBinaryStream(written))).toEqual(DATA);
    });
});
