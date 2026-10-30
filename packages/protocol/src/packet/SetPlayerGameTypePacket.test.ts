import { Gametype } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import { PacketIdentifier } from '../PacketIdentifier';
import SetPlayerGameTypePacket from './SetPlayerGameTypePacket';
import type { SetPlayerGameTypePayload } from '../wire/definitions/player';

/** One ZigZag varint32 after the header. */
describe('SetPlayerGameTypePacket', () => {
    const encoded = (gametype: Gametype): Buffer => {
        const payload: SetPlayerGameTypePayload = { gametype };
        const packet = new SetPlayerGameTypePacket(payload);
        packet.encode();

        return packet.getBuffer();
    };

    it('writes the header and ZigZag varint of the game type', () => {
        expect(encoded(Gametype.SPECTATOR)).toEqual(Buffer.from([PacketIdentifier.SET_PLAYER_GAME_TYPE, 0x0c]));
        expect(encoded(Gametype.UNDEFINED)).toEqual(Buffer.from([PacketIdentifier.SET_PLAYER_GAME_TYPE, 0x01]));
    });

    it('decodes the game type payload', () => {
        const packet = new SetPlayerGameTypePacket(Buffer.from([PacketIdentifier.SET_PLAYER_GAME_TYPE, 0x0c]));
        packet.decode();

        expect(packet.getPacketData()).toEqual({ gametype: Gametype.SPECTATOR });
    });

    it('uses the expected network identifier', () => {
        expect(new SetPlayerGameTypePacket({ gametype: Gametype.SURVIVAL }).getId()).toBe(
            PacketIdentifier.SET_PLAYER_GAME_TYPE
        );
    });
});
