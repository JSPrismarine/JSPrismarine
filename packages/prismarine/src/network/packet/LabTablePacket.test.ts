import { describe, expect, it } from 'vitest';
import BlockPosition from '../../world/BlockPosition';
import LabTablePacket, { LabTableReactionType, LabTableType } from './LabTablePacket';

const ENCODED = Buffer.concat([
    Buffer.from([0x6d]), // Header: id 109 as LEB128.
    Buffer.from([0x01]), // Type StartReaction.
    Buffer.from([0x02, 0x03, 0x06]), // Position 1, -2, 3 as ZigZag varint32.
    Buffer.from([0x02]) // Reaction Bleach.
]);

describe('LabTablePacket', () => {
    it('encodes the action, the signed block position and the reaction', () => {
        const packet = Object.assign(new LabTablePacket(), {
            type: LabTableType.StartReaction,
            position: new BlockPosition(1, -2, 3),
            reaction: LabTableReactionType.Bleach
        });
        packet.encode();

        expect(packet.getBuffer()).toEqual(ENCODED);
    });

    it('decodes every field and consumes the whole buffer', () => {
        const packet = new LabTablePacket(ENCODED);
        packet.decode();

        expect(packet.type).toBe(LabTableType.StartReaction);
        expect(packet.position).toEqual(new BlockPosition(1, -2, 3));
        expect(packet.reaction).toBe(LabTableReactionType.Bleach);
        expect(packet.feof()).toBe(true);
    });
});
