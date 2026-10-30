import { Gametype } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import { PacketIdentifier } from '../PacketIdentifier';
import SetDefaultGameTypePacket from './SetDefaultGameTypePacket';

/**
 * One ZigZag varint32 after the header. Spectator is 6, which ZigZag turns into 12, so a plain
 * LEB128 write of the same number would fail the comparison.
 */
describe('SetDefaultGameTypePacket', () => {
    it('writes the header and the ZigZag varint of the default game type', () => {
        const packet = new SetDefaultGameTypePacket();
        packet.gamemode = Gametype.SPECTATOR;
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([PacketIdentifier.SET_DEFAULT_GAME_TYPE, 0x0c]));
    });

    it('defaults to survival, which is a single zero byte', () => {
        const packet = new SetDefaultGameTypePacket();
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([PacketIdentifier.SET_DEFAULT_GAME_TYPE, 0x00]));
    });

    it('reads the default game type and consumes the whole buffer', () => {
        const packet = new SetDefaultGameTypePacket(Buffer.from([PacketIdentifier.SET_DEFAULT_GAME_TYPE, 0x04]));
        packet.decode();

        expect(packet.gamemode).toBe(Gametype.ADVENTURE);
        expect(packet.feof()).toBe(true);
    });
});
