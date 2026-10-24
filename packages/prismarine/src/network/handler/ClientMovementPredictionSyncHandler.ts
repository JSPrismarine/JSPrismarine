import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type ClientMovementPredictionSyncPacket from '../packet/ClientMovementPredictionSyncPacket';
import type PacketHandler from './PacketHandler';

/**
 * The client's movement prediction inputs.
 *
 * The server does not compare them with its own actor data, so the packet is summarized at
 * debug level and dropped. It only arrives after the server has sent a movement correction.
 */
export default class ClientMovementPredictionSyncHandler implements PacketHandler<ClientMovementPredictionSyncPacket> {
    public static NetID = Identifiers.ClientMovementPredictionSyncPacket;

    /** Logs the actor, its speeds, and whether it is flying. */
    public handle(packet: ClientMovementPredictionSyncPacket, server: Server, session: PlayerSession): void {
        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} predicts actor ${packet.actorUniqueId} with speed ${packet.movementSpeed}, jump ${packet.jumpStrength}, box ${packet.boundingBoxWidth}x${packet.boundingBoxHeight}, flags 0x${packet.actorFlags.toString(16)}${packet.actorFlyingState ? ', flying' : ''}`,
                'ClientMovementPredictionSyncHandler/handle'
            );
    }
}
