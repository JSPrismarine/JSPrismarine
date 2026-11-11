import type PlayerLocationPacket from '@jsprismarine/protocol/packet/PlayerLocationPacket';
import { PlayerLocationPacketType } from '@jsprismarine/protocol/packet/PlayerLocationPacket';
import type { SessionContext } from './HandlerContext';
import type { ConnectionLaneHandler } from './SessionHandler';

/**
 * A player location update arriving from a client.
 *
 * The packet is defined for the server to tell clients where far-away players are, and a
 * client has no business sending it. One that does is recorded at debug level and ignored.
 */
export default class PlayerLocationHandler implements ConnectionLaneHandler<PlayerLocationPacket> {
    public static PacketName = 'PlayerLocationPacket';
    public readonly takes = 'context';
    public readonly phases = ['play'] as const;
    public readonly lane = 'connection';

    /** Logs the target and whether it was a position or a hide. */
    public handle(packet: PlayerLocationPacket, { session, log }: SessionContext): void {
        const data = packet.getPacketData();
        if (data === null) throw new Error('Cannot handle a PlayerLocationPacket without a payload');
        const location =
            data.packetType === PlayerLocationPacketType.PLAYER_LOCATION_HIDE
                ? 'hidden'
                : `at ${data.position.x}, ${data.position.y}, ${data.position.z}`;

        log.debug(
            `${session.identity.name} sent a player location for actor ${data.targetActorId} (${location}), which only the server should send`,
            'PlayerLocationHandler/handle'
        );
    }
}
