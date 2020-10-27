const Identifiers = require('../Identifiers').default;
<<<<<<< HEAD
const Player = require('../../player/Player').default;
=======
const Player = require('../../player').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e
const LevelSoundEventPacket = require('../packet/level-sound-event');
const Prismarine = require('../../Prismarine');


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
