import type { PlayerSession } from '../../';
import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type SetDefaultGameTypePacket from '../packet/SetDefaultGameTypePacket';
import type PacketHandler from './PacketHandler';

export default class SetDefaultGameTypeHandler implements PacketHandler<SetDefaultGameTypePacket> {
    public static NetID = Identifiers.SetDefaultGameTypePacket;

    public async handle(packet: SetDefaultGameTypePacket, server: Server, session: PlayerSession): Promise<void> {
        if (!session.getPlayer().isOp()) {
            server
                .getLogger()
                .warn(
                    `Player ${session.getPlayer().getName()} tried to change default gamemode without proper permissions.`
                );
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
