/* import Identifiers from '../Identifiers';
import type PacketHandler from './PacketHandler';
import { type PlayerSession } from '../../';
import type Server from '../../Server';
import type SetDefaultGameTypePacket from '../packet/SetDefaultGameTypePacket';

export default class SetDefaultGameTypeHandler implements PacketHandler<SetDefaultGameTypePacket> {
    public static NetID = Identifiers.SetDefaultGameTypePacket;

    public async handle(packet: SetDefaultGameTypePacket, server: Server, session: PlayerSession): Promise<void> {
        if (!session.getPlayer().isOp()) {
            return;
        }

        server.getConfig().setGamemode(packet.gamemode, true);
        server
            .getPlayerManager()
            .getOnlinePlayers()
            .map((player) => {
                player.setGamemode(packet.gamemode);
            })
    }
} */
