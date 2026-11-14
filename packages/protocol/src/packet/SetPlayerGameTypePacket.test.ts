import { Gametype } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import { PacketIdentifier } from '../PacketIdentifier';
import SetPlayerGameTypePacket from './SetPlayerGameTypePacket';
import type { SetPlayerGameTypePayload } from '../wire/definitions/player';
import { enumDumpMembers } from '../testing/evidence.test.helper';

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

    it('numbers every game type the way the pinned game dump does', () => {
        const dump = enumDumpMembers('GameType');

        expect(dump.length).toBeGreaterThan(0);
        expect(Object.fromEntries(dump.map(({ name, value }) => [name, value]))).toMatchObject({
            Undefined: Gametype.UNDEFINED,
            Survival: Gametype.SURVIVAL,
            Creative: Gametype.CREATIVE,
            Adventure: Gametype.ADVENTURE,
            Default: Gametype.DEFAULT,
            Spectator: Gametype.SPECTATOR,
            WorldDefault: Gametype.WORLD_DEFAULT
        });
    });

    it.each([2193, 2225])('round-trips every game type at protocol %i', (protocol) => {
        for (const gametype of [
            Gametype.UNDEFINED,
            Gametype.SURVIVAL,
            Gametype.CREATIVE,
            Gametype.ADVENTURE,
            Gametype.DEFAULT,
            Gametype.SPECTATOR
        ]) {
            const out = new SetPlayerGameTypePacket({ gametype });
            out.codecProtocol = protocol;
            const buffer = out.serialize(new NetworkBinaryStream());

            const back = new SetPlayerGameTypePacket();
            back.codecProtocol = protocol;
            expect(back.deserialize(new NetworkBinaryStream(buffer))).toEqual({ gametype });
        }
    });
});
