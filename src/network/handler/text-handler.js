const Player = require('../../player')
const Identifiers = require('../identifiers')
const TextPacket = require('../packet/text')
const EventManager = require('../../events/event-manager')
const logger = require('../../utils/logger')
const PlayerChatEvent = require('../../events/player/player-chat-event')
const TextType = require('../type/text-type')

'use strict'

class TextHandler {
    static NetID = Identifiers.TextPacket

    /**
     * @param {TextPacket} packet 
     * @param {Player} player 
     */
    static handle(packet, player) {
        let event = new PlayerChatEvent(this, packet.message)
        EventManager.emit('player_chat', event)
        if (event.isCancelled()) return

        let vanillaFormat = `<${packet.sourceName}> ${event.getMessage()}`
        logger.silly(vanillaFormat)

        // Broadcast chat message to every player
        if (packet.type == TextType.Chat) {
            for (const [_, onlinePlayer] of player.getServer().players) {
                onlinePlayer.sendMessage(vanillaFormat, packet.xuid)
            }
        }
    }
}
module.exports = TextHandler
