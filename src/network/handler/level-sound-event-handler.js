const Player = require('../../player/Player').default;
const LevelSoundEventPacket = require('../packet/level-sound-event');
const Prismarine = require('../../Prismarine');
const Identifiers = require('../Identifiers').default;


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
            chunkPlayer.getPlayerConnection().sendDataPacket(packet);
        }
    }
}
module.exports = LevelSoundEventHandler;
