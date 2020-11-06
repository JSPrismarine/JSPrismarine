import Chat from '../../chat/Chat';
import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';
import Identifiers from '../Identifiers';
import type TextPacket from '../packet/TextPacket';

export default class TextHandler {
    static NetID = Identifiers.TextPacket;

    static async handle(
        packet: TextPacket,
        server: Prismarine,
        player: Player
    ) {
        // Emit chat event
        const chat = new Chat(
            player,
            `${player.getFormattedUsername()} ${packet.message}`
        );
        await server.getChatManager().send(chat);
    }
}
