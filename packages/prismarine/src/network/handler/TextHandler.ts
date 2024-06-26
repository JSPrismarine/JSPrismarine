import { Chat } from '../../chat/Chat';
import Identifiers from '../Identifiers';
import type PacketHandler from './PacketHandler';
import type { PlayerSession } from '../../';
import type Server from '../../Server';
import type TextPacket from '../packet/TextPacket';

export default class TextHandler implements PacketHandler<TextPacket> {
    public static NetID = Identifiers.TextPacket;

    public async handle(packet: TextPacket, server: Server, session: PlayerSession): Promise<void> {
        // Emit chat event
        const player = session.getPlayer();
        const chat = new Chat({ sender: player, message: `${player.getFormattedUsername()} ${packet.message}` });
        await server.getChatManager().send(chat);
    }
}
