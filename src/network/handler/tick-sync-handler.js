const Identifiers = require('../identifiers');
const TickSyncPacket = require('../packet/tick-sync');
const Player = require('../../player').default;
const Prismarine = require('../../prismarine');


class TickSyncHandler {
    static NetID = Identifiers.TickSyncPacket

    /**
     * @param {TickSyncPacket} _packet
     * @param {Prismarine} _server 
     * @param {Player} _player 
     */
    static handle(_packet, _server, _player) {}
}
module.exports = TickSyncHandler;
