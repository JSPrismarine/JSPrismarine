import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import PlayerLocationPacket, { PlayerLocationPacketType } from '../packet/PlayerLocationPacket';
import PlayerLocationHandler from './PlayerLocationHandler';

const fakeSession = () => {
    const logged: string[] = [];
    const server = stub<Server>({
        getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
    });
    const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });

    return { logged, server, session };
};

describe('PlayerLocationHandler', () => {
    it('logs a position', () => {
        const { logged, server, session } = fakeSession();
        const packet = Object.assign(new PlayerLocationPacket(), {
            targetActorId: 9n,
            packetType: PlayerLocationPacketType.PLAYER_LOCATION_COORDINATES,
            position: new Vector3(1, 2, 3)
        });

        new PlayerLocationHandler().handle(packet, server, session);

        expect(logged).toEqual([
            'Steve sent a player location for actor 9 (at 1, 2, 3), which only the server should send'
        ]);
    });

    it('logs a hide', () => {
        const { logged, server, session } = fakeSession();
        const packet = Object.assign(new PlayerLocationPacket(), { targetActorId: 9n });

        new PlayerLocationHandler().handle(packet, server, session);

        expect(logged).toEqual([
            'Steve sent a player location for actor 9 (hidden), which only the server should send'
        ]);
    });
});
