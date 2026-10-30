import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import MultiplayerSettingsPacket, {
    MultiplayerSettingsPacketType
} from '@jsprismarine/protocol/packet/MultiplayerSettingsPacket';
import MultiplayerSettingsHandler from './MultiplayerSettingsHandler';

describe('MultiplayerSettingsHandler', () => {
    const stage = () => {
        const logged: string[] = [];
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });
        return { logged, server, session };
    };

    it('logs the requested setting by name', () => {
        const { logged, server, session } = stage();
        const packet = Object.assign(new MultiplayerSettingsPacket(), {
            packetType: MultiplayerSettingsPacketType.RefreshJoincode
        });

        new MultiplayerSettingsHandler().handle(packet, server, session);

        expect(logged).toEqual([
            'Steve asked for multiplayer setting RefreshJoincode. Education Edition sessions are not modeled'
        ]);
    });

    it('logs the number when the setting is not one it knows', () => {
        const { logged, server, session } = stage();
        const packet = Object.assign(new MultiplayerSettingsPacket(), { packetType: 99 });

        new MultiplayerSettingsHandler().handle(packet, server, session);

        expect(logged).toEqual([
            'Steve asked for multiplayer setting type 99. Education Edition sessions are not modeled'
        ]);
    });
});
