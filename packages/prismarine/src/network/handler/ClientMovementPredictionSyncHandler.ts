import type ClientMovementPredictionSyncPacket from '@jsprismarine/protocol/bedrock/packet/ClientMovementPredictionSyncPacket';
import type { SessionContext } from './HandlerContext';
import type { ConnectionLaneHandler } from './SessionHandler';
import { PrismarineNetworkErrors } from '@jsprismarine/errors/prismarine/network';

/**
 * The client's movement prediction inputs.
 *
 * The server does not compare them with its own actor data, so the packet is summarized at
 * debug level and dropped. It only arrives after the server has sent a movement correction.
 */
export default class ClientMovementPredictionSyncHandler implements ConnectionLaneHandler<ClientMovementPredictionSyncPacket> {
    public static PacketName = 'ClientMovementPredictionSyncPacket';
    public readonly phases = ['play'] as const;
    public readonly lane = 'connection';

    /** Logs the actor, its speeds, and whether it is flying. */
    public handle(packet: ClientMovementPredictionSyncPacket, { session, log }: SessionContext): void {
        const data = packet.getPacketData();
        if (data === null) throw new PrismarineNetworkErrors.MovementPredictionSyncNotDecoded();

        log.debug(
            `${session.identity.name} predicts actor ${data.actorUniqueId} with speed ${data.movementSpeed}, jump ${data.jumpStrength}, box ${data.boundingBoxWidth}x${data.boundingBoxHeight}, flags 0x${data.actorFlags.toString(16)}${data.actorFlyingState ? ', flying' : ''}`
        );
    }
}
