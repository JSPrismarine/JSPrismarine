import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type PlayerSkinPacket from '../packet/PlayerSkinPacket';
import type PacketHandler from './PacketHandler';

/**
 * A client changing its skin mid-session.
 *
 * The change is not applied: `PlayerSkinPacket` does not decode the skin yet, so there is
 * nothing to store or to show other players. Handled so the packet stops surfacing as a
 * handler error, and logged so a skin that did not change can be traced to here.
 */
export default class PlayerSkinHandler implements PacketHandler<PlayerSkinPacket> {
    public static NetID = Identifiers.PlayerSkinPacket;

    /**
     * Logs at debug level that the skin change was not applied.
     * @param {PlayerSkinPacket} _packet - The skin change, which is not decoded yet.
     * @param {Server} server - The server, for its logger.
     * @param {PlayerSession} session - The client that sent it.
     */
    public handle(_packet: PlayerSkinPacket, server: Server, session: PlayerSession): void {
        server
            .getLogger()
            .debug(
                `Skin change from §b${session.getPlayer().getName()}§r not applied: skin changes are not supported yet`,
                'PlayerSkinHandler/handle'
            );
    }
}
