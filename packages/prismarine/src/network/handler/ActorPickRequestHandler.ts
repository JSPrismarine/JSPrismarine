import type ActorPickRequestPacket from '@jsprismarine/protocol/packet/ActorPickRequestPacket';
import type { SessionContext } from './HandlerContext';
import type { ConnectionLaneHandler } from './SessionHandler';

/**
 * An actor pick.
 *
 * The pick is recorded at debug level and dropped. Known gap: there is no spawn egg item
 * mapping to hand back, and no server-initiated hotbar write to put it in.
 */
export default class ActorPickRequestHandler implements ConnectionLaneHandler<ActorPickRequestPacket> {
    public static PacketName = 'ActorPickRequestPacket';
    public readonly takes = 'context';
    public readonly phases = ['play'] as const;
    public readonly lane = 'connection';

    /** Logs the picked actor. */
    public handle(packet: ActorPickRequestPacket, { session, log }: SessionContext): void {
        log.debug(
            `${session.identity.name} picked actor ${packet.actorId}${packet.withData ? ' with data' : ''} (${packet.maxSlots} free hotbar slots). Actor picking is not implemented`,
            'ActorPickRequestHandler/handle'
        );
    }
}
