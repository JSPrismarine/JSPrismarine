import type CommandRequestPacket from '../packet/CommandRequestPacket';
import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import type Server from '../../Server';

export default class CommandRequestHandler
    implements PacketHandler<CommandRequestPacket> {
    public handle(
        packet: CommandRequestPacket,
        server: Server,
        player: Player
    ): void {
        player
            .getServer()
            .getCommandManager()
            .dispatchCommand(player, packet.commandName);
    }
}
