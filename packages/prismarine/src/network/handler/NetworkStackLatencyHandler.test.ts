import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import NetworkStackLatencyPacket from '../packet/NetworkStackLatencyPacket';
import NetworkStackLatencyHandler from './NetworkStackLatencyHandler';

describe('NetworkStackLatencyHandler', () => {
    it('logs the timestamp and sends nothing', () => {
        const logged: string[] = [];
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });
        const packet = Object.assign(new NetworkStackLatencyPacket(), { creationTime: 42n });

        new NetworkStackLatencyHandler().handle(packet, server, session);

        expect(logged).toEqual(['Steve pinged at 42']);
    });
});
