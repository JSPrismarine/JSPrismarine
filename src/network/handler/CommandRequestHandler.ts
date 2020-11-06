import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';
import type CommandRequestPacket from '../packet/CommandRequestPacket';
import Identifiers from '../Identifiers';

export default class CommandRequestHandler {
    static NetID = Identifiers.CommandRequestPacket;

    static handle(
        packet: CommandRequestPacket,
        server: Prismarine,
        player: Player
    ) {
        player
            .getServer()
            .getCommandManager()
            .dispatchCommand(player, packet.commandName);
    }
}
