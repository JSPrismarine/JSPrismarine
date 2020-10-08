const Identifiers = require('../identifiers');
const Player = require('../../player');
const LevelSoundEventPacket = require('../packet/level-sound-event');
const Prismarine = require('../../prismarine');


class LevelSoundEventHandler {
    static NetID = Identifiers.LevelSoundEventPacket

    /**
     * @param {LevelSoundEventPacket} _packet
     * @param {Prismarine} _server 
     * @param {Player} _player 
     */
    static handle(_packet, _server, _player) {
        // TODO: broadcast to viewers
    }
}
module.exports = LevelSoundEventHandler;
