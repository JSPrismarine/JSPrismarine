import { DisconnectReason } from '@jsprismarine/minecraft';
import { DisconnectPacket } from '@jsprismarine/protocol';
import { describe, expect, it, vi } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type { InetAddress } from '@jsprismarine/raknet';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type ClientConnection from '../ClientConnection';
import type PlayerSession from '../PlayerSession';
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
    new DisconnectPacket(
        message === undefined
            ? { reason, skipMessage: true }
            : { reason, skipMessage: false, message, filteredMessage: '' }
    );

describe('DisconnectHandler', () => {
    it('logs the reason by number and name, and the message, with who sent them', async () => {
        const { info, server, session } = harness();

        await new DisconnectHandler().handle(
            goodbye(DisconnectReason.UNRECOVERABLE_ERROR, 'Disconnected'),
            server,
            session
        );

        expect(info).toHaveBeenCalledOnce();
        const [line] = info.mock.calls[0]!;
        expect(line).toContain('runner');
        expect(line).toContain('127.0.0.1:19133');
        expect(line).toContain('reason 3 (UNRECOVERABLE_ERROR)');
        expect(line).toContain('"Disconnected"');
    });

    it('logs a goodbye that carries no message without inventing one', async () => {
        const { info, server, session } = harness();

        await new DisconnectHandler().handle(goodbye(DisconnectReason.UNKNOWN), server, session);

        const [line] = info.mock.calls[0]!;
        expect(line).toContain('reason 0 (UNKNOWN)');
        expect(line).not.toContain('message');
    });

    it('logs a reason the enum does not list as its bare number', async () => {
        // A newer client may send a member added after protocol 2193.
        const { info, server, session } = harness();

        await new DisconnectHandler().handle(goodbye(150), server, session);

        const [line] = info.mock.calls[0]!;
        expect(line).toMatch(/reason 150$/);
    });

    it('hangs up on RakNet after logging', async () => {
        // The goodbye, not the teardown: the RakNet close that follows is what releases the
        // player, and it does so once, through the same path a timeout takes.
        const { forceDisconnect, server, session } = harness();

        await new DisconnectHandler().handle(
            goodbye(DisconnectReason.UNRECOVERABLE_ERROR, 'Disconnected'),
            server,
            session
        );

        expect(forceDisconnect).toHaveBeenCalledOnce();
    });
});
