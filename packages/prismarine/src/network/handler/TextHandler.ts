import Chat from '../../chat/Chat';
import Identifiers from '../Identifiers';
import type PacketHandler from './PacketHandler';
import type { PlayerSession } from '../../';
import type Server from '../../Server';
import type { PacketData } from '@jsprismarine/protocol';

export default class TextHandler implements PacketHandler<PacketData.Text> {
    public static NetID = Identifiers.TextPacket;

    public async handle(data: PacketData.Text, server: Server, session: PlayerSession): Promise<void> {
        // Emit chat event
        const player = session.getPlayer();
        const chat = new Chat(player, `${player.getFormattedUsername()} ${data.message}`);
        await server.getChatManager().send(chat);
    }
}
