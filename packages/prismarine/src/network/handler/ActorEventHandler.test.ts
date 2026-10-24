import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it, vi } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import ActorEventPacket, { ActorEvent } from '../packet/ActorEventPacket';
import ActorEventHandler from './ActorEventHandler';

describe('ActorEventHandler', () => {
    it('accepts the event and says so at debug level', () => {
        // Registered with no handler, the packet made `PacketRegistry.getHandler` throw and
        // the server logged a handler error for every one a client sent.
        const debug = vi.fn();
        const server = stub<Server>({ getLogger: () => stub<Logger>({ debug }) });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'runner' }) });

        const packet = Object.assign(new ActorEventPacket(), {
            runtimeEntityId: 1n,
            event: ActorEvent.START_ATTACKING,
            data: 0
        });

        expect(() => new ActorEventHandler().handle(packet, server, session)).not.toThrow();
        expect(debug).toHaveBeenCalledOnce();
        expect(debug.mock.calls[0]?.[0]).toContain('runner');
    });
});
