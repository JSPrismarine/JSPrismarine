const PlayerEvent = require('./player_event')

'use strict'

class PlayerChatEvent extends PlayerEvent {
    #message

    constructor(player, message) {
        super(player)
        this.#message = message
    }

    getMessage() {
        return this.#message
    }
}
module.exports = PlayerChatEvent