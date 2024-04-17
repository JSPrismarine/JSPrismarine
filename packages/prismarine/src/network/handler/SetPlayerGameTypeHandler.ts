import type { PlayerSession } from '../../';
import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type SetPlayerGameTypePacket from '../packet/SetPlayerGameTypePacket';
import type PacketHandler from './PacketHandler';

export default class SetPlayerGameTypeHandler implements PacketHandler<SetPlayerGameTypePacket> {
    public static NetID = Identifiers.SetPlayerGameTypePacket;

    public async handle(packet: SetPlayerGameTypePacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        if (server.getPermissionManager().can(player).execute('minecraft.command.gamemode')) {
            return;
        }

        await player.setGamemode(packet.gametype);
    }
}
