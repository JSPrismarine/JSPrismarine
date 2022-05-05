import Identifiers from '../Identifiers';
import PacketHandler from './PacketHandler';
import { PlayerConnection } from '../../Prismarine';
import type Server from '../../Server';
import SetDefaultGameTypePacket from '../packet/SetDefaultGameTypePacket';

export default class SetDefaultGameTypeHandler implements PacketHandler<SetDefaultGameTypePacket> {
    public static NetID = Identifiers.SetDefaultGameTypePacket;

    public async handle(packet: SetDefaultGameTypePacket, server: Server, connection: PlayerConnection): Promise<void> {
        if (!connection.getPlayer().isOp()) {
            return;
        }

        server.getConfig().setGamemode(packet.gamemode, true);
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
