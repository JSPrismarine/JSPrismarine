import { describe, expect, it } from 'vitest';

import { Gametype } from '@jsprismarine/minecraft';
import Identifiers from '../Identifiers';
import SetPlayerGametypePacket from './SetPlayerGametypePacket';

/**
 * One varint32 after the header. The values chosen here change under ZigZag, so a plain
 * LEB128 write of the same number would fail the comparison.
 */
describe('SetPlayerGametypePacket', () => {
    const encoded = (gametype: Gametype): Buffer => {
        const packet = new SetPlayerGametypePacket();
        packet.gametype = gametype;
        packet.encode();

        return packet.getBuffer();
    };

    it('writes the header and the ZigZag varint of the game type', () => {
        expect(encoded(Gametype.SPECTATOR)).toEqual(Buffer.from([Identifiers.SetPlayerGametypePacket, 0x0c]));
        expect(encoded(Gametype.UNDEFINED)).toEqual(Buffer.from([Identifiers.SetPlayerGametypePacket, 0x01]));
    });

    it('reads the game type and consumes the whole buffer', () => {
        const packet = new SetPlayerGametypePacket(Buffer.from([Identifiers.SetPlayerGametypePacket, 0x0c]));
        packet.decode();

        expect(packet.gametype).toBe(Gametype.SPECTATOR);
        expect(packet.feof()).toBe(true);
    });
});
