import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';

import { sessionContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import type PlayerSession from '../PlayerSession';
import MultiplayerSettingsPacket, {
    MultiplayerSettingsPacketType
} from '@jsprismarine/protocol/packet/MultiplayerSettingsPacket';
import MultiplayerSettingsHandler from './MultiplayerSettingsHandler';

describe('MultiplayerSettingsHandler', () => {
    const stage = () => {
        const logged: string[] = [];
        const log = stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') });
        const session = stub<PlayerSession>({ identity: STEVE });
        return { logged, context: sessionContext(session, { log }) };
    };

    it('logs the requested setting by name', () => {
        const { logged, context } = stage();
        const packet = Object.assign(new MultiplayerSettingsPacket(), {
            packetType: MultiplayerSettingsPacketType.RefreshJoincode
        });

        new MultiplayerSettingsHandler().handle(packet, context);

        expect(logged).toEqual([
            'Steve asked for multiplayer setting RefreshJoincode. Education Edition sessions are not modeled'
        ]);
    });

    it('logs the number when the setting is not one it knows', () => {
        const { logged, context } = stage();
        const packet = Object.assign(new MultiplayerSettingsPacket(), { packetType: 99 });

        new MultiplayerSettingsHandler().handle(packet, context);

        expect(logged).toEqual([
            'Steve asked for multiplayer setting type 99. Education Edition sessions are not modeled'
        ]);
    });
});
