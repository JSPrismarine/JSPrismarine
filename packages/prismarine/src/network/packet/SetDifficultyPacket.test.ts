import { Difficulty } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';
import SetDifficultyPacket from './SetDifficultyPacket';

describe('SetDifficultyPacket', () => {
    it('decodes the varuint difficulty and consumes the whole buffer', () => {
        const packet = new SetDifficultyPacket(Buffer.from([0x3c, 0x03]));
        packet.decode();

        expect(packet.difficulty).toBe(Difficulty.HARD);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same byte', () => {
        const packet = new SetDifficultyPacket();
        packet.difficulty = Difficulty.PEACEFUL;
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([0x3c, 0x00]));
    });
});
