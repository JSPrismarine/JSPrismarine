import Identifiers from '../Identifiers';
import PacketHandler from './PacketHandler';
import { PlayerSession } from '../../';
import type Server from '../../Server';
import SetDefaultGameTypePacket from '../packet/SetDefaultGameTypePacket';

export default class SetDefaultGameTypeHandler implements PacketHandler<SetDefaultGameTypePacket> {
    public static NetID = Identifiers.SetDefaultGameTypePacket;

    public async handle(packet: SetDefaultGameTypePacket, server: Server, session: PlayerSession): Promise<void> {
        if (!session.getPlayer().isOp()) {
            return;
        }

        server.getConfig().setGamemode(packet.gamemode, true);
        await Promise.all(
            server
                .getSessionManager()
                .getAllPlayers()
                .map(async (player) => {
                    await player.setGamemode(packet.gamemode);
                })
        );
    }
}
