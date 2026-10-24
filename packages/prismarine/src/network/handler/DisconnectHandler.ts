import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type DisconnectPacket from '../packet/DisconnectPacket';
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
    public static NetID = Identifiers.DisconnectPacket;

    /** Logs the reason the client gave at info level, then starts the RakNet goodbye. */
    public async handle(packet: DisconnectPacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        const message = packet.skipMessage ? '' : ` and message "${packet.message}"`;

        server
            .getLogger()
            .info(
                `${player.getName()} (${player.getAddress().toToken()}) disconnected with reason ${packet.reason}${message}`,
                'DisconnectHandler/handle'
            );

        session.getConnection().forceDisconnect();
    }
}
