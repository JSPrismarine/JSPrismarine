const Identifiers = require('../identifiers');
const Player = require('../../player/player').default;
const InventoryTransactionPacket = require('../packet/inventory-transaction');
const Prismarine = require('../../prismarine');


class InventoryTransactionHandler {
    static NetID = Identifiers.InventoryTransactionPacket

    /**
     * @param {Player} _player 
     * @param {Prismarine} _server
     * @param {InventoryTransactionPacket} _packet 
     */
    static handle(_packet, _server, _player) { console.log(_packet); }
}
module.exports = InventoryTransactionHandler;
