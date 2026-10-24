import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type NetworkStackLatencyPacket from '../packet/NetworkStackLatencyPacket';
import type PacketHandler from './PacketHandler';

/**
 * The client's latency ping.
 *
 * The server never sends a ping of its own, so there is no round trip to complete. The
 * timestamp is recorded at debug level and nothing goes back.
 */
export default class NetworkStackLatencyHandler implements PacketHandler<NetworkStackLatencyPacket> {
    public static NetID = Identifiers.NetworkStackLatencyPacket;

    /** Logs the ping without answering it. */
    public handle(packet: NetworkStackLatencyPacket, server: Server, session: PlayerSession): void {
        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} pinged at ${packet.creationTime}${packet.isFromServer ? ' in reply to a server ping' : ''}`,
                'NetworkStackLatencyHandler/handle'
            );
    }
}
