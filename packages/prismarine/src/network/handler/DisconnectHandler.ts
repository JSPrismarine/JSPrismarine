import { DisconnectReason } from '@jsprismarine/minecraft';
import type { DisconnectPacket } from '@jsprismarine/protocol';
import type { SessionContext } from './HandlerContext';
import type { ConnectionLaneHandler } from './SessionHandler';

/**
 * The client saying goodbye, and why.
 *
 * A client that leaves on purpose sends this before it drops the RakNet session. Without
 * a handler the registry threw "Invalid handler with id 5" and the reason was lost, which
 * matters when a client gives up part way through a join. The handler logs the reason and
 * hangs up on RakNet. It does not tear the player down itself. The RakNet close that
 * follows reaches `ClientConnection.closePlayerSession`, which is the one teardown path,
 * and running it here first would make that close look like a client that never spawned.
 */
export default class DisconnectHandler implements ConnectionLaneHandler<DisconnectPacket> {
    public static PacketName = 'DisconnectPacket';
    public readonly takes = 'context';
    public readonly phases = ['resourcePacks', 'play'] as const;
    // Connection, not input: this only hangs up. The dispatcher holds the removal of the player
    // that the closed transport causes as an input of its own, behind this client's earlier
    // inputs, and that removal is what tells everyone else.
    public readonly lane = 'connection';

    /**
     * Logs the reason the client gave at info level, then starts the RakNet goodbye.
     *
     * The reason is logged as its number and, when the number is a `DisconnectReason` member,
     * its name. A bare number out of 150 members says little to whoever reads the log.
     */
    public handle(packet: DisconnectPacket, { session, log }: SessionContext): void {
        const disconnect = packet.getPacketData();
        if (disconnect === null) throw new Error('DisconnectPacket has no payload');

        const name = DisconnectReason[disconnect.reason];
        const reason = name === undefined ? `${disconnect.reason}` : `${disconnect.reason} (${name})`;
        const message = disconnect.skipMessage ? '' : ` and message "${disconnect.message ?? ''}"`;

        log.info(
            `${session.identity.name} (${session.getConnection().getAddress().toToken()}) disconnected with reason ${reason}${message}`,
            'DisconnectHandler/handle'
        );

        session.getConnection().forceDisconnect();
    }
}
