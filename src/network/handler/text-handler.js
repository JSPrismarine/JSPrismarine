const Player = require('../../player/Player').default;
const Identifiers = require('../Identifiers').default;
const TextPacket = require('../packet/text');
const EventManager = require('../../events/event-manager');
const logger = require('../../utils/Logger');
const PlayerChatEvent = require('../../events/player/player-chat-event');
const TextType = require('../type/text-type');
const Prismarine = require('../../Prismarine');


class TextHandler {
    static NetID = Identifiers.TextPacket

    /**
     * @param {TextPacket} packet
     * @param {Prismarine} server 
     * @param {Player} player 
     */
    static handle(packet, server, player) {
        let event = new PlayerChatEvent(this, packet.message);
        EventManager.emit('player_chat', event);
        if (event.isCancelled()) return;

        let vanillaFormat = `<${packet.sourceName}> ${event.getMessage()}`;
        server.getLogger().info(vanillaFormat);

        // Broadcast chat message to every player
        if (packet.type == TextType.Chat) {
            for (let onlinePlayer of server.getOnlinePlayers()) {
                onlinePlayer.sendMessage(vanillaFormat, packet.xuid);
            }
        }
    }
}
module.exports = TextHandler;
