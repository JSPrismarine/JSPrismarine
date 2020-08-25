const Identifiers = require('../identifiers')
const Player = require('../../player')
const LevelSoundEventPacket = require('../packet/level-sound-event')

'use strict'

class LevelSoundEventHandler {
    static NetID = Identifiers.LevelSoundEventPacket

    /**
     * @param {LevelSoundEventPacket} packet 
     * @param {Player} player 
     */
    static handle(packet, player) {
        // TODO: broadcast to viewers
    }
}
module.exports = LevelSoundEventHandler