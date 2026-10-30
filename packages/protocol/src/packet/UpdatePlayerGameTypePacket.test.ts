import { Gametype } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import { PacketIdentifier } from '../PacketIdentifier';
import UpdatePlayerGameTypePacket from './UpdatePlayerGameTypePacket';
import type { UpdatePlayerGameTypePayload } from '../wire/definitions/player';

// Packet id 151 as a varuint.
const header = [0x97, 0x01];

describe('UpdatePlayerGameTypePacket', () => {
    it('encodes the game type, target player, and tick', () => {
        const payload: UpdatePlayerGameTypePayload = {
            playerGameType: Gametype.CREATIVE,
            targetPlayer: 5n,
            tick: 300n
        };
        const packet = new UpdatePlayerGameTypePacket(payload);
        packet.encode();

        // Creative is 1, ZigZag encoded as 2; unique id 5 as 10; tick as a plain LEB128 varuint64.
        expect(packet.getBuffer()).toEqual(Buffer.from([...header, 0x02, 0x0a, 0xac, 0x02]));
    });

    it('writes the documented spectator enum value as a ZigZag varint', () => {
        const packet = new UpdatePlayerGameTypePacket({
            playerGameType: Gametype.SPECTATOR,
            targetPlayer: 0n,
            tick: 0n
        });
        packet.encode();

        // 6 ZigZag encoded is 12.
        expect(packet.getBuffer()).toEqual(Buffer.from([...header, 0x0c, 0x00, 0x00]));
    });

    it('decodes a negative unique id and the tick', () => {
        const packet = new UpdatePlayerGameTypePacket(Buffer.from([...header, 0x04, 0x03, 0x00]));
        packet.decode();

        expect(packet.getPacketData()).toEqual({ playerGameType: Gametype.ADVENTURE, targetPlayer: -2n, tick: 0n });
    });

    it('uses the expected network identifier', () => {
        expect(
            new UpdatePlayerGameTypePacket({ playerGameType: Gametype.SURVIVAL, targetPlayer: 0n, tick: 0n }).getId()
        ).toBe(PacketIdentifier.UPDATE_PLAYER_GAME_TYPE);
    });
});
