import AnimatePacket from '../packet/AnimatePacket';
import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';

export default class AnimateHandler implements PacketHandler<AnimatePacket> {
    public handle(
        packet: AnimatePacket,
        server: Prismarine,
        player: Player
    ): void {
        const pk = new AnimatePacket();
        pk.runtimeEntityId = player.runtimeId;
        pk.action = packet.action;

        Promise.all(
            server
                .getOnlinePlayers()
                .filter((onlinePlayer) => !(onlinePlayer == player))
                .map((otherPlayer) =>
                    otherPlayer.getConnection().sendDataPacket(pk)
                )
        );
    }
}
