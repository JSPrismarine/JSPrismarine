import Chat from '../../chat/Chat.js';
import Identifiers from '../Identifiers.js';
import PacketHandler from './PacketHandler.js';
import { PlayerSession } from '../../Prismarine.js';
import type Server from '../../Server.js';
import type TextPacket from '../packet/TextPacket.js';

export default class TextHandler implements PacketHandler<TextPacket> {
    public static NetID = Identifiers.TextPacket;

    public async handle(packet: TextPacket, server: Server, session: PlayerSession): Promise<void> {
        // Emit chat event
        const player = session.getPlayer();
        const chat = new Chat(player, `${player.getFormattedUsername()} ${packet.message}`);
        await server.getChatManager().send(chat);
    }
}
