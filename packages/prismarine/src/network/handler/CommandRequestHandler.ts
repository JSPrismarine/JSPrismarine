import type CommandRequestPacket from '../packet/CommandRequestPacket.js';
import Identifiers from '../Identifiers.js';
import PacketHandler from './PacketHandler.js';
import { PlayerSession } from '../../Prismarine.js';
import type Server from '../../Server.js';

export default class CommandRequestHandler implements PacketHandler<CommandRequestPacket> {
    public static NetID = Identifiers.CommandRequestPacket;

    public async handle(packet: CommandRequestPacket, _server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        await player.getServer().getCommandManager().dispatchCommand(player, player, packet.commandName.slice(1));
    }
}
