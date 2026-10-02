import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import AnimatePacket from '../packet/AnimatePacket';
import type PacketHandler from './PacketHandler';

export default class AnimateHandler implements PacketHandler<AnimatePacket> {
    public static NetID = Identifiers.AnimatePacket;

    public async handle(packet: AnimatePacket, _server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        const pk = new AnimatePacket();
        pk.runtimeEntityId = player.getRuntimeId();
        pk.action = packet.action;

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
