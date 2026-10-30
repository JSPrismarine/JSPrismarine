import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import PositionTrackingDBClientRequestPacket from '@jsprismarine/protocol/packet/PositionTrackingDBClientRequestPacket';
import PositionTrackingDBClientRequestHandler from './PositionTrackingDBClientRequestHandler';

describe('PositionTrackingDBClientRequestHandler', () => {
    it('logs the tracking id the client asked about', () => {
        const logged: string[] = [];
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });
        const packet = Object.assign(new PositionTrackingDBClientRequestPacket(), { id: 42 });

        new PositionTrackingDBClientRequestHandler().handle(packet, server, session);

        expect(logged).toEqual(['Steve asked for tracked position 42. Position tracking is not modeled']);
    });

    it('drops a request whose action is not Query', () => {
        const logged: string[] = [];
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });
        const packet = Object.assign(new PositionTrackingDBClientRequestPacket(), { action: 7, id: 42 });

        new PositionTrackingDBClientRequestHandler().handle(packet, server, session);

        expect(logged).toEqual(['Dropped a position tracking request from Steve with the unknown action 7']);
    });
});
