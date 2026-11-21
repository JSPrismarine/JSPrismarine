import BinaryStream from '@jsprismarine/binaryutils';
import { Difficulty } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';
import { setDifficultyPacket } from '../wire/definitions/worldStatus';
import { layoutAt } from '../../wire/WireLayout';
import SetDifficultyPacket from './SetDifficultyPacket';
import { capture } from '../../testing/evidence.test.helper';

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

    it.each([2193, 2225])('round-trips the real server capture at protocol %i', (protocol) => {
        const bytes = capture(protocol, 0x3c);
        const layout = layoutAt(setDifficultyPacket, protocol);
        const decoded = layout.decode(new BinaryStream(bytes));
        expect(decoded).toEqual({ difficulty: Difficulty.EASY });

        const out = new BinaryStream();
        layout.encode(out, decoded);
        expect(out.getBuffer()).toEqual(bytes);
    });
});
