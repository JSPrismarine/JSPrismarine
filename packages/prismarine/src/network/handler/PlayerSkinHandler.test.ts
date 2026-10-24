import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it, vi } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import PlayerSkinPacket from '../packet/PlayerSkinPacket';
import PlayerSkinHandler from './PlayerSkinHandler';

describe('PlayerSkinHandler', () => {
    it('accepts a skin change without applying it, and says so at debug level', () => {
        // The packet does not decode the skin yet, so there is nothing to apply. Handled all
        // the same: unhandled, it surfaced as a handler error on every skin change.
        const debug = vi.fn();
        const server = stub<Server>({ getLogger: () => stub<Logger>({ debug }) });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'runner' }) });

        expect(() => new PlayerSkinHandler().handle(new PlayerSkinPacket(), server, session)).not.toThrow();
        expect(debug).toHaveBeenCalledOnce();
        expect(debug.mock.calls[0]?.[0]).toContain('not applied');
    });
});
