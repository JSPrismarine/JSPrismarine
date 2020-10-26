import Chat from "../../chat/Chat";
import ChatEvent from "../../events/chat/ChatEvent";
import type Player from "../../player";
import type Prismarine from "../../Prismarine";
import Identifiers from "../Identifiers";
import type TextPacket from "../packet/text";
import TextType from "../type/text-type";

export default class TextHandler {
    static NetID = Identifiers.TextPacket

    static async handle(packet: TextPacket, server: Prismarine, player: Player) {
        // Emit chat event
        const event = new ChatEvent(new Chat(player, packet.message));
        await server.getEventManager().post(['chat', event]);
    }
}
