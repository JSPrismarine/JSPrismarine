import type ClientMovementPredictionSyncPacket from '@jsprismarine/protocol/packet/ClientMovementPredictionSyncPacket';
import type { SessionContext } from './HandlerContext';
import type { ConnectionLaneHandler } from './SessionHandler';

/**
 * The client's movement prediction inputs.
 *
 * The server does not compare them with its own actor data, so the packet is summarized at
 * debug level and dropped. It only arrives after the server has sent a movement correction.
 */
export default class ClientMovementPredictionSyncHandler implements ConnectionLaneHandler<ClientMovementPredictionSyncPacket> {
    public static PacketName = 'ClientMovementPredictionSyncPacket';
    public readonly takes = 'context';
    public readonly phases = ['play'] as const;
    public readonly lane = 'connection';

    /** Logs the actor, its speeds, and whether it is flying. */
    public handle(packet: ClientMovementPredictionSyncPacket, { session, log }: SessionContext): void {
        log.debug(
            `${session.identity.name} predicts actor ${packet.actorUniqueId} with speed ${packet.movementSpeed}, jump ${packet.jumpStrength}, box ${packet.boundingBoxWidth}x${packet.boundingBoxHeight}, flags 0x${packet.actorFlags.toString(16)}${packet.actorFlyingState ? ', flying' : ''}`,
            'ClientMovementPredictionSyncHandler/handle'
        );
    }
}
