import { describe, expect, it, vi } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type { InetAddress } from '@jsprismarine/raknet';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type ClientConnection from '../ClientConnection';
import type PlayerSession from '../PlayerSession';
import DisconnectPacket from '../packet/DisconnectPacket';
import DisconnectHandler from './DisconnectHandler';

/**
 * A client that leaves says why, and the server used to throw that away.
 *
 * The packet arrived, found no handler, and the registry threw "Invalid handler with id 5"
 * into the log in place of the reason. For a client that gives up part way through a join
 * the reason is the only clue there is.
 */
const harness = () => {
    const info = vi.fn();
    const forceDisconnect = vi.fn();

    const server = stub<Server>({ getLogger: () => stub<Logger>({ info }) });
    const session = stub<PlayerSession>({
        getPlayer: () =>
            stub<Player>({
                getName: () => 'runner',
                getAddress: () => stub<InetAddress>({ toToken: () => '127.0.0.1:19133' })
            }),
        getConnection: () => stub<ClientConnection>({ forceDisconnect })
    });

    return { info, forceDisconnect, server, session };
};

const goodbye = (reason: number, message?: string): DisconnectPacket =>
    Object.assign(new DisconnectPacket(), {
        reason,
        skipMessage: message === undefined,
        message: message ?? ''
    });

describe('DisconnectHandler', () => {
    it('logs the reason and message with who sent them', async () => {
        const { info, server, session } = harness();

        await new DisconnectHandler().handle(goodbye(3, 'Disconnected'), server, session);

        expect(info).toHaveBeenCalledOnce();
        const [line] = info.mock.calls[0]!;
        expect(line).toContain('runner');
        expect(line).toContain('127.0.0.1:19133');
        expect(line).toContain('reason 3');
        expect(line).toContain('"Disconnected"');
    });

    it('logs a goodbye that carries no message without inventing one', async () => {
        const { info, server, session } = harness();

        await new DisconnectHandler().handle(goodbye(0), server, session);

        const [line] = info.mock.calls[0]!;
        expect(line).toContain('reason 0');
        expect(line).not.toContain('message');
    });

    it('hangs up on RakNet after logging', async () => {
        // The goodbye, not the teardown: the RakNet close that follows is what releases the
        // player, and it does so once, through the same path a timeout takes.
        const { forceDisconnect, server, session } = harness();

        await new DisconnectHandler().handle(goodbye(3, 'Disconnected'), server, session);

        expect(forceDisconnect).toHaveBeenCalledOnce();
    });
});
