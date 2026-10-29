import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type ActorPickRequestPacket from '../packet/ActorPickRequestPacket';
import type PacketHandler from './PacketHandler';

/**
 * An actor pick.
 *
 * The pick is recorded at debug level and dropped. Known gap: there is no spawn egg item
 * mapping to hand back, and no server-initiated hotbar write to put it in.
 */
export default class ActorPickRequestHandler implements PacketHandler<ActorPickRequestPacket> {
    public static PacketName = 'ActorPickRequestPacket';
    public readonly phases = ['play'] as const;

    /** Logs the picked actor. */
    public handle(packet: ActorPickRequestPacket, server: Server, session: PlayerSession): void {
        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} picked actor ${packet.actorId}${packet.withData ? ' with data' : ''} (${packet.maxSlots} free hotbar slots). Actor picking is not implemented`,
                'ActorPickRequestHandler/handle'
            );
    }
}
