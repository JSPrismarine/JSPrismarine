import { Gametype } from '@jsprismarine/minecraft';
import { PacketIdentifier } from '@jsprismarine/protocol';
import SetPlayerGameTypePacket from '@jsprismarine/protocol/bedrock/packet/SetPlayerGameTypePacket';
import { describe, expect, it } from 'vitest';

import { decodeView } from '../../../testing/decodeView.test-utils';
import SetPlayerGameTypeDecoder from './SetPlayerGameTypeDecoder';

describe('SetPlayerGameTypeDecoder', () => {
    it('decodes the requested game type', () => {
        const { view } = decodeView();

        expect(
            new SetPlayerGameTypeDecoder().decode(new SetPlayerGameTypePacket({ gametype: Gametype.CREATIVE }), view)
        ).toStrictEqual([{ kind: 'changeGameMode', gamemode: Gametype.CREATIVE }]);
    });

    it('passes a value that is not a game type on, for the handler to refuse', () => {
        const { view } = decodeView();
        // 42 is not a `Gametype`, so it has to come in off the wire: ZigZag of 42 is 0x54.
        const packet = new SetPlayerGameTypePacket(Buffer.from([PacketIdentifier.SET_PLAYER_GAME_TYPE, 0x54]));
        packet.decode();

        expect(new SetPlayerGameTypeDecoder().decode(packet, view)).toStrictEqual([
            { kind: 'changeGameMode', gamemode: 42 }
        ]);
    });
});
