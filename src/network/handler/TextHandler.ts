import { message } from "git-rev-sync";
import ChatEvent from "../../events/chat/ChatEvent";
import type Player from "../../player";
import type Prismarine from "../../Prismarine";
import Identifiers from "../identifiers";
import type TextPacket from "../packet/text";
import TextType from "../type/text-type";

export default class TextHandler {
    static NetID = Identifiers.TextPacket

    static async handle(packet: TextPacket, server: Prismarine, player: Player) {
        // Emit chat event
        const event = new ChatEvent(player, packet.message);
        await server.getEventManager().post(['chat', event]);
        if (event.cancelled)
            return;

        let vanillaFormat = `<${packet.sourceName}> ${packet.message}`;
        server.getLogger().info(vanillaFormat);

        // Broadcast chat message to every player
        if (packet.type == TextType.Chat) {
            for (let onlinePlayer of server.getOnlinePlayers()) {
                onlinePlayer.sendMessage(vanillaFormat, packet.xuid);
            }
        }
    }
}
