import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import type Server from '../../Server';
import SetDefaultGameTypePacket from '../packet/SetDefaultGameTypePacket';

export default class SetDefaultGameTypeHandler
    implements PacketHandler<SetDefaultGameTypePacket> {
    public async handle(
        packet: SetDefaultGameTypePacket,
        server: Server,
        player: Player
    ): Promise<void> {
        if (!player.isOp()) {
            return;
        }

        server.getConfig().setGamemode(packet.gamemode);
        await Promise.all(
            server
                .getPlayerManager()
                .getOnlinePlayers()
                .map(async (player) => {
                    await player.setGamemode(packet.gamemode);
                })
        );
    }
}
