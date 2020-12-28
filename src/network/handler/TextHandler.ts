import Chat from '../../chat/Chat';
import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import type Server from '../../Server';
import type TextPacket from '../packet/TextPacket';

export default class TextHandler implements PacketHandler<TextPacket> {
    public async handle(
        packet: TextPacket,
        server: Server,
        player: Player
    ): Promise<void> {
        // Emit chat event
        const chat = new Chat(
            player,
            `${player.getFormattedUsername()} ${packet.message}`
        );
        await server.getChatManager().send(chat);
    }
}
