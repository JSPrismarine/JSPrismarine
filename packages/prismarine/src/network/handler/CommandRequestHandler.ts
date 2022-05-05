import type CommandRequestPacket from '../packet/CommandRequestPacket';
import Identifiers from '../Identifiers';
import PacketHandler from './PacketHandler';
import { PlayerConnection } from '../../Prismarine';
import type Server from '../../Server';

export default class CommandRequestHandler implements PacketHandler<CommandRequestPacket> {
    public static NetID = Identifiers.CommandRequestPacket;

    public async handle(packet: CommandRequestPacket, _server: Server, connection: PlayerConnection): Promise<void> {
        const player = connection.getPlayer();
        await player.getServer().getCommandManager().dispatchCommand(player, player, packet.commandName.slice(1));
    }
}
