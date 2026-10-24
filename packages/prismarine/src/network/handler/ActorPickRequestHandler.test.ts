import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import ActorPickRequestPacket from '../packet/ActorPickRequestPacket';
import ActorPickRequestHandler from './ActorPickRequestHandler';

describe('ActorPickRequestHandler', () => {
    it('logs the actor and flags', () => {
        const logged: string[] = [];
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });
        const packet = Object.assign(new ActorPickRequestPacket(), { actorId: 12n, maxSlots: 0, withData: false });

        new ActorPickRequestHandler().handle(packet, server, session);

        expect(logged).toEqual(['Steve picked actor 12 (0 free hotbar slots). Actor picking is not implemented']);
    });
});
