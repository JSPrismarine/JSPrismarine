import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { sessionContext } from '../../testing/handlerContext.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { STEVE } from '../../testing/sessionIdentity.test.helper';
import type PlayerSession from '../PlayerSession';
import Vec3 from '@jsprismarine/protocol/structure/Vec3';
import PlayerLocationPacket, { PlayerLocationPacketType } from '@jsprismarine/protocol/packet/PlayerLocationPacket';
import PlayerLocationHandler from './PlayerLocationHandler';

const fakeSession = () => {
    const logged: string[] = [];
    const log = stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') });
    const session = stub<PlayerSession>({ identity: STEVE });

    return { logged, context: sessionContext(session, { log }) };
};

describe('PlayerLocationHandler', () => {
    it('logs a position', () => {
        const { logged, context } = fakeSession();
        const packet = new PlayerLocationPacket({
            targetActorId: 9n,
            packetType: PlayerLocationPacketType.PLAYER_LOCATION_COORDINATES,
            position: new Vec3(1, 2, 3)
        });

        new PlayerLocationHandler().handle(packet, context);

        expect(logged).toEqual([
            'Steve sent a player location for actor 9 (at 1, 2, 3), which only the server should send'
        ]);
    });

    it('logs a hide', () => {
        const { logged, context } = fakeSession();
        const packet = new PlayerLocationPacket({
            targetActorId: 9n,
            packetType: PlayerLocationPacketType.PLAYER_LOCATION_HIDE,
            position: null
        });

        new PlayerLocationHandler().handle(packet, context);

        expect(logged).toEqual([
            'Steve sent a player location for actor 9 (hidden), which only the server should send'
        ]);
    });
});
