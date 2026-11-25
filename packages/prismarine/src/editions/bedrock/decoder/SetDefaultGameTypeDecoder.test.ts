import { Gametype } from '@jsprismarine/minecraft';
import SetDefaultGameTypePacket from '@jsprismarine/protocol/bedrock/packet/SetDefaultGameTypePacket';
import { describe, expect, it } from 'vitest';

import { latestCodec } from '../../../network/codec/CodecRegistry';
import { decodeView } from '../../../testing/decodeView.test-utils';
import SetDefaultGameTypeDecoder from './SetDefaultGameTypeDecoder';

describe('SetDefaultGameTypeDecoder', () => {
    it('decodes the requested default', () => {
        const { view } = decodeView();

        expect(
            new SetDefaultGameTypeDecoder().decode(
                Object.assign(new SetDefaultGameTypePacket(), { gamemode: Gametype.CREATIVE }),
                view
            )
        ).toStrictEqual([{ kind: 'setDefaultGameMode', gamemode: Gametype.CREATIVE }]);
    });

    it('passes a value the config cannot hold on, for the handler to refuse', () => {
        const { view } = decodeView();
        // 42 is not a `Gametype`, so it has to come in off the wire: ZigZag of 42 is 0x54.
        const packet = new SetDefaultGameTypePacket(Buffer.from([latestCodec.ids.SetDefaultGameTypePacket!, 0x54]));
        packet.decode();

        expect(new SetDefaultGameTypeDecoder().decode(packet, view)).toStrictEqual([
            { kind: 'setDefaultGameMode', gamemode: 42 }
        ]);
    });
});
