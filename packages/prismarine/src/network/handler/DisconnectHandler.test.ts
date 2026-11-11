import { DisconnectReason } from '@jsprismarine/minecraft';
import { DisconnectPacket } from '@jsprismarine/protocol';
import { describe, expect, it, vi } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type { InetAddress } from '@jsprismarine/raknet';
import { sessionContext } from '../../testing/handlerContext.test.helper';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
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

    const session = stub<PlayerSession>({
        identity: identityNamed('runner'),
        getConnection: () =>
            stub<ClientConnection>({
                forceDisconnect,
                getAddress: () => stub<InetAddress>({ toToken: () => '127.0.0.1:19133' })
            })
    });

    return { info, forceDisconnect, context: sessionContext(session, { log: stub<Logger>({ info }) }) };
};

const goodbye = (reason: number, message?: string): DisconnectPacket =>
    new DisconnectPacket(
        message === undefined
            ? { reason, skipMessage: true }
            : { reason, skipMessage: false, message, filteredMessage: '' }
    );

describe('DisconnectHandler', () => {
    it('logs the reason by number and name, and the message, with who sent them', () => {
        const { info, context } = harness();

        new DisconnectHandler().handle(goodbye(DisconnectReason.UNRECOVERABLE_ERROR, 'Disconnected'), context);

        expect(info).toHaveBeenCalledOnce();
        const [line] = info.mock.calls[0]!;
        expect(line).toContain('runner');
        expect(line).toContain('127.0.0.1:19133');
        expect(line).toContain('reason 3 (UNRECOVERABLE_ERROR)');
        expect(line).toContain('"Disconnected"');
    });

    it('logs a goodbye that carries no message without inventing one', () => {
        const { info, context } = harness();

        new DisconnectHandler().handle(goodbye(DisconnectReason.UNKNOWN), context);

        const [line] = info.mock.calls[0]!;
        expect(line).toContain('reason 0 (UNKNOWN)');
        expect(line).not.toContain('message');
    });

    it('logs a reason the enum does not list as its bare number', () => {
        // A newer client may send a member added after protocol 2193.
        const { info, context } = harness();

        new DisconnectHandler().handle(goodbye(150), context);

        const [line] = info.mock.calls[0]!;
        expect(line).toMatch(/reason 150$/);
    });

    it('hangs up on RakNet after logging', () => {
        // The goodbye, not the teardown: the RakNet close that follows is what releases the
        // player, and it does so once, through the same path a timeout takes.
        const { forceDisconnect, context } = harness();

        new DisconnectHandler().handle(goodbye(DisconnectReason.UNRECOVERABLE_ERROR, 'Disconnected'), context);

        expect(forceDisconnect).toHaveBeenCalledOnce();
    });
});
