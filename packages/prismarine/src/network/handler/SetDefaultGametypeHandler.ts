import type { PlayerSession } from '../../';
import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type SetDefaultGametypePacket from '../packet/SetDefaultGametypePacket';
import type PacketHandler from './PacketHandler';

export default class SetDefaultGametypeHandler implements PacketHandler<SetDefaultGametypePacket> {
    public static NetID = Identifiers.SetDefaultGametypePacket;

    public async handle(packet: SetDefaultGametypePacket, server: Server, session: PlayerSession): Promise<void> {
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
