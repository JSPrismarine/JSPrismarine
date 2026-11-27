import { DisconnectReason } from '@jsprismarine/minecraft';
import type { DisconnectPacket } from '@jsprismarine/protocol';
import type { SessionContext } from '../../../player/context/HandlerContext';
import type { ConnectionLaneHandler } from '../../../player/context/SessionHandler';
import { PrismarineNetworkErrors } from '@jsprismarine/errors/prismarine/network';

/**
 * The reasons a client gives for leaving when it could not take what the server sent: a packet it
 * could not read or did not expect, a level it could not load, or a join it could not finish.
 */
const SERVER_FAULTS: ReadonlySet<DisconnectReason> = new Set([
    DisconnectReason.UNRECOVERABLE_ERROR,
    DisconnectReason.WORLD_CORRUPTION,
    DisconnectReason.UNKNOWN_PACKET,
    DisconnectReason.UNEXPECTED_PACKET,
    DisconnectReason.RESOURCE_PACK_PROBLEM,
    DisconnectReason.INVALID_LEVEL,
    DisconnectReason.BLOCK_MISMATCH,
    DisconnectReason.INVALID_HEIGHTS,
    DisconnectReason.INVALID_WIDTHS,
    DisconnectReason.LOADING_STATE_TIMEOUT,
    DisconnectReason.RESOURCE_PACK_LOADING_FAILED,
    DisconnectReason.BAD_PACKET,
    DisconnectReason.CLIENT_GAME_SETUP_FAILED
]);

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
    public readonly phases = ['resourcePacks', 'play'] as const;
    // Connection, not input: this only hangs up. The dispatcher holds the removal of the player
    // that the closed transport causes as an input of its own, behind this client's earlier
    // inputs, and that removal is what tells everyone else.
    public readonly lane = 'connection';

    /**
     * Logs the reason the client gave at info level, then starts the RakNet goodbye.
     *
     * The reason is logged as its number and, when the number is a `DisconnectReason` member,
     * its name. A bare number out of 150 members says little to whoever reads the log. A client
     * that leaves its join for a reason that blames the server's packets reports a failed join.
     */
    public handle(packet: DisconnectPacket, { session, log }: SessionContext): void {
        const disconnect = packet.getPacketData();
        if (disconnect === null) throw new PrismarineNetworkErrors.DisconnectNotDecoded();

        const name = DisconnectReason[disconnect.reason];
        const reason = name === undefined ? `${disconnect.reason}` : `${disconnect.reason} (${name})`;
        const { messages } = disconnect;
        const message = messages.skipMessage ? '' : ` and message "${messages.message}"`;

        log.info(
            `${session.identity.name} (${session.getConnection().getAddress().toToken()}) disconnected with reason ${reason}${message}`
        );
        if (SERVER_FAULTS.has(disconnect.reason))
            session.getConnection().reportJoinFailure(log, `The client left with reason ${reason}${message}.`);

        session.getConnection().forceDisconnect();
    }
}
