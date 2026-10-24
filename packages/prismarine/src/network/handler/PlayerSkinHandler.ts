import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type PlayerSkinPacket from '../packet/PlayerSkinPacket';
import type PacketHandler from './PacketHandler';

/**
 * A client changing its skin mid-session.
 *
 * The skin is stored on the player, so the player list shows it to anyone who joins later,
 * and the packet is forwarded as received to every other online player, so they see the
 * change now. A packet naming another player's UUID is dropped: the server forwards the
 * packet unchanged, so honoring it would let one client redress another.
 */
export default class PlayerSkinHandler implements PacketHandler<PlayerSkinPacket> {
    public static NetID = Identifiers.PlayerSkinPacket;

    /**
     * Stores the new skin on the sender and forwards the packet to every other player.
     * @param {PlayerSkinPacket} packet - The skin change.
     * @param {Server} server - The server, for its players and logger.
     * @param {PlayerSession} session - The client that sent it.
     */
    public async handle(packet: PlayerSkinPacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        const logger = server.getLogger();

        if (!packet.uuid.equals(player.getUUID())) {
            logger.debug(
                `Dropped skin change from §b${player.getName()}§r for another player's UUID ${packet.uuid.toString()}`,
                'PlayerSkinHandler/handle'
            );
            return;
        }

        player.skin = packet.skin;

        const others = server
            .getSessionManager()
            .getAllPlayers()
            .filter((other) => other !== player);
        await Promise.all(others.map((other) => other.getNetworkSession().getConnection().sendDataPacket(packet)));

        logger.debug(
            `§b${player.getName()}§r changed skin to §b${packet.skin.getId()}§r, forwarded to ${others.length} player(s)`,
            'PlayerSkinHandler/handle'
        );
    }
}
