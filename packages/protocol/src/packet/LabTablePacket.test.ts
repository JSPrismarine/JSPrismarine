import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import BlockPos from '../structure/BlockPos';
import LabTablePacket, { LabTableReactionType, LabTableType } from './LabTablePacket';

const ENCODED = Buffer.from([0x6d, 0x01, 0x02, 0x03, 0x06, 0x02]);
const DATA = {
    type: LabTableType.StartReaction,
    position: new BlockPos(1, -2, 3),
    reaction: LabTableReactionType.Bleach
};

describe('LabTablePacket', () => {
    it('encodes the action, signed block position, and reaction', () => {
        expect(new LabTablePacket(DATA).serialize(new NetworkBinaryStream())).toEqual(ENCODED);
    });

    it('decodes every field and consumes the whole buffer', () => {
        const stream = new NetworkBinaryStream(ENCODED);

        expect(new LabTablePacket().deserialize(stream)).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });
});
