import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import BlockPos from '../structure/BlockPos';
import BlockPickRequestPacket from './BlockPickRequestPacket';

import type { BlockPickRequest } from './BlockPickRequestPacket';

const DATA: BlockPickRequest = { position: new BlockPos(1, -64, 3), withData: true, maxSlots: 9 };
const BYTES = Buffer.from([0x22, 0x02, 0x7f, 0x06, 0x01, 0x09]);

describe('BlockPickRequestPacket', () => {
    it('writes the signed position, data flag, and empty slot count', () => {
        const buffer = new BlockPickRequestPacket(DATA).serialize(new NetworkBinaryStream());

        expect(buffer).toEqual(BYTES);
    });

    it('reads a hand-built request to the end of the packet', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new BlockPickRequestPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });
});
