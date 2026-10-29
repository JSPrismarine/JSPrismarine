import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type SubClientLoginPacket from '../packet/SubClientLoginPacket';
import type PacketHandler from './PacketHandler';

/**
 * A second player trying to join through the connection of one that is already in.
 *
 * The attempt is recorded at debug level and dropped. Known gap: the server binds one player
 * to one connection, so there is nowhere to put a sub-client. Granting one would need the
 * session to hold several players and every outgoing packet to carry the right sub-client id
 * in its header. Answering the sub-client with `PlayStatus(LoginFailed_ServerFullSubClient)`
 * would also need the header's sender sub-client id, which `DataPacket` reads but does not
 * expose. The client stays on the split screen waiting screen until the player backs out of it.
 */
export default class SubClientLoginHandler implements PacketHandler<SubClientLoginPacket> {
    public static PacketName = 'SubClientLoginPacket';
    public readonly phases = ['play'] as const;

    /** Logs the refusal against the player who already holds the connection. */
    public handle(_packet: SubClientLoginPacket, server: Server, session: PlayerSession): void {
        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} tried to add a split screen player, which the server does not support`,
                'SubClientLoginHandler/handle'
            );
    }
}
