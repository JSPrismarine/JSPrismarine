import Chat from '../../chat/Chat';
import Identifiers from '../Identifiers';
import PacketHandler from './PacketHandler';
import { PlayerConnection } from '../../Prismarine';
import type Server from '../../Server';
import type TextPacket from '../packet/TextPacket';

export default class TextHandler implements PacketHandler<TextPacket> {
    public static NetID = Identifiers.TextPacket;

    public async handle(packet: TextPacket, server: Server, connection: PlayerConnection): Promise<void> {
        // Emit chat event
        const player = connection.getPlayer();
        const chat = new Chat(player, `${player.getFormattedUsername()} ${packet.message}`);
        await server.getChatManager().send(chat);
    }
}
