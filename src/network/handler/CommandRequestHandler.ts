import type CommandRequestPacket from '../packet/CommandRequestPacket';
import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';

export default class CommandRequestHandler
    implements PacketHandler<CommandRequestPacket> {
    public handle(
        packet: CommandRequestPacket,
        server: Prismarine,
        player: Player
    ): void {
        player
            .getServer()
            .getCommandManager()
            .dispatchCommand(player, packet.commandName);
    }
}
