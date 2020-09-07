const Identifiers = require('../identifiers')
const Player = require('../../player')
const InventoryTransactionPacket = require('../packet/inventory-transaction')

'use strict'

class InventoryTransactionHandler {
    static NetID = Identifiers.InventoryTransactionPacket

    /**
     * @param {Player} player 
     * @param {InventoryTransactionPacket} packet 
     */
    static handle(player, packet) {
        // TODO
    }
}
module.exports = InventoryTransactionHandler