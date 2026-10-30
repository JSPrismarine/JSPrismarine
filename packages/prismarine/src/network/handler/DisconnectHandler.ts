import { DisconnectReason } from '@jsprismarine/minecraft';
import type { DisconnectPacket } from '@jsprismarine/protocol';
import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type PacketHandler from './PacketHandler';

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
export default class DisconnectHandler implements PacketHandler<DisconnectPacket> {
    public static PacketName = 'DisconnectPacket';
    public readonly phases = ['resourcePacks', 'play'] as const;

    /**
     * Logs the reason the client gave at info level, then starts the RakNet goodbye.
     *
     * The reason is logged as its number and, when the number is a `DisconnectReason` member,
     * its name. A bare number out of 150 members says little to whoever reads the log.
     */
    public async handle(packet: DisconnectPacket, server: Server, session: PlayerSession): Promise<void> {
        const disconnect = packet.getPacketData();
        if (disconnect === null) throw new Error('DisconnectPacket has no payload');

        const player = session.getPlayer();
        const name = DisconnectReason[disconnect.reason];
        const reason = name === undefined ? `${disconnect.reason}` : `${disconnect.reason} (${name})`;
        const message = disconnect.skipMessage ? '' : ` and message "${disconnect.message ?? ''}"`;

        server
            .getLogger()
            .info(
                `${player.getName()} (${player.getAddress().toToken()}) disconnected with reason ${reason}${message}`,
                'DisconnectHandler/handle'
            );

        session.getConnection().forceDisconnect();
    }
}
