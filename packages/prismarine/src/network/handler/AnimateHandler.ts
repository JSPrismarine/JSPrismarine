import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import AnimatePacket from '../packet/AnimatePacket';
import type PacketHandler from './PacketHandler';

/** Relays a client's animation to the players in its world that have it on screen. */
export default class AnimateHandler implements PacketHandler<AnimatePacket> {
    public static NetID = Identifiers.AnimatePacket;

    /**
     * Rebroadcasts the animation under the sender's runtime id, keeping the action, data and
     * swing source the client sent. The sender and anyone not tracking it are skipped.
     */
    public async handle(packet: AnimatePacket, _server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        const pk = new AnimatePacket();
        pk.runtimeEntityId = player.getRuntimeId();
        pk.action = packet.action;
        pk.data = packet.data;
        pk.swingSource = packet.swingSource;

        // The player's own world, and only the clients that have them on screen. This went
        // through the session manager, so an arm swing reached every player on the server -
        // across worlds, and at any distance.
        await Promise.all(
            player
                .getWorld()
                .getPlayers()
                .filter((otherPlayer) => otherPlayer !== player)
                .filter((otherPlayer) => otherPlayer.getNetworkSession().tracks(player.getRuntimeId()))
                .map(async (otherPlayer) => otherPlayer.getNetworkSession().send(pk))
        );
    }
}
