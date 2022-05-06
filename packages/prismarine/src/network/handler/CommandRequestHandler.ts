import type CommandRequestPacket from '../packet/CommandRequestPacket';
import Identifiers from '../Identifiers';
import PacketHandler from './PacketHandler';
import { PlayerSession } from '../../Prismarine';
import type Server from '../../Server';

export default class CommandRequestHandler implements PacketHandler<CommandRequestPacket> {
    public static NetID = Identifiers.CommandRequestPacket;

    public async handle(packet: CommandRequestPacket, _server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        await player.getServer().getCommandManager().dispatchCommand(player, player, packet.commandName.slice(1));
    }
}
