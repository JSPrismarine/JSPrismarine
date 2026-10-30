import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type PlayerLocationPacket from '@jsprismarine/protocol/packet/PlayerLocationPacket';
import { PlayerLocationPacketType } from '@jsprismarine/protocol/packet/PlayerLocationPacket';
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
        const data = packet.getPacketData();
        if (data === null) throw new Error('Cannot handle a PlayerLocationPacket without a payload');
        const location =
            data.packetType === PlayerLocationPacketType.PLAYER_LOCATION_HIDE
                ? 'hidden'
                : `at ${data.position.x}, ${data.position.y}, ${data.position.z}`;

        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} sent a player location for actor ${data.targetActorId} (${location}), which only the server should send`,
                'PlayerLocationHandler/handle'
            );
    }
}
