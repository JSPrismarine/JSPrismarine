import type { PlayerSession } from '../../';
import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type SetPlayerGametypePacket from '../packet/SetPlayerGametypePacket';
import type PacketHandler from './PacketHandler';

export default class SetPlayerGametypeHandler implements PacketHandler<SetPlayerGametypePacket> {
    public static NetID = Identifiers.SetPlayerGametypePacket;

    public async handle(packet: SetPlayerGametypePacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        if (server.getPermissionManager().can(player).execute('minecraft.command.gamemode')) {
            return;
        }

        await player.setGamemode(packet.gametype);
    }
}
