const Identifiers = require('../identifiers');
const Player = require('../../player').default;
const LevelSoundEventPacket = require('../packet/level-sound-event');
const Prismarine = require('../../prismarine');


class LevelSoundEventHandler {
    static NetID = Identifiers.LevelSoundEventPacket

    /**
     * @param {LevelSoundEventPacket} packet
     * @param {Prismarine} _server 
     * @param {Player} player 
     */
    static handle(packet, _server, player) {
        // TODO: broadcast to viewers
        for (let chunkPlayer of player.getPlayersInChunk()) {
            chunkPlayer.sendDataPacket(packet);
        }
    }
}
module.exports = LevelSoundEventHandler;
