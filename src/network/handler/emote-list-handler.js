const Player = require('../../player/Player').default;
const Prismarine = require('../../Prismarine');
const Identifiers = require('../identifiers');
const EmoteListPacket = require('../packet/emote-list');


class EmoteListHandler {
    static NetID = Identifiers.EmoteListPacket

    /**
     * @param {EmoteListPacket} _packet 
     * @param {Prismarine} _server
     * @param {Player} _player 
     */
    static handle(_packet, _server, _player) {}
}
module.exports = EmoteListHandler;
