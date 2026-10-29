import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type PlayerLocationPacket from '../packet/PlayerLocationPacket';
import type PacketHandler from './PacketHandler';

/**
 * A player location update arriving from a client.
 *
 * The packet is defined for the server to tell clients where far-away players are, and a
 * client has no business sending it. One that does is recorded at debug level and ignored.
 */
export default class PlayerLocationHandler implements PacketHandler<PlayerLocationPacket> {
    public static PacketName = 'PlayerLocationPacket';
    public readonly phases = ['play'] as const;

    /** Logs the target and whether it was a position or a hide. */
    public handle(packet: PlayerLocationPacket, server: Server, session: PlayerSession): void {
        const location =
            packet.position === null
                ? 'hidden'
                : `at ${packet.position.getX()}, ${packet.position.getY()}, ${packet.position.getZ()}`;

        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} sent a player location for actor ${packet.targetActorId} (${location}), which only the server should send`,
                'PlayerLocationHandler/handle'
            );
    }
}
