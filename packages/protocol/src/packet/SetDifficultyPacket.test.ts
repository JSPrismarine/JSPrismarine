import { Difficulty } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';
import SetDifficultyPacket from './SetDifficultyPacket';

describe('SetDifficultyPacket', () => {
    it('decodes the varuint difficulty from a packet buffer', () => {
        const packet = new SetDifficultyPacket(Buffer.from([0x3c, 0x03]));
        packet.decode();

        expect(packet.getPacketData()).toEqual({ difficulty: Difficulty.HARD });
    });

    it('encodes a difficulty value as varuint32', () => {
        const packet = new SetDifficultyPacket({ difficulty: Difficulty.PEACEFUL });
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([0x3c, 0x00]));
    });
});
