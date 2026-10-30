import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import BlockPos from '../structure/BlockPos';
import AnvilDamagePacket from './AnvilDamagePacket';

import type { AnvilDamage } from './AnvilDamagePacket';

const DATA: AnvilDamage = { blockPosition: new BlockPos(-1, 70, 2) };
const BYTES = Buffer.from([0x8d, 0x01, 0x01, 0x8c, 0x01, 0x04]);

describe('AnvilDamagePacket', () => {
    it('writes the signed block position', () => {
        const buffer = new AnvilDamagePacket(DATA).serialize(new NetworkBinaryStream());

        expect(buffer).toEqual(BYTES);
    });

    it('reads a hand-built block position to the end of the packet', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new AnvilDamagePacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });
});
