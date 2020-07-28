const DataPacket = require('./packet')
const Identifiers = require('../identifiers')
const logger = require('../../utils/logger')

'use strict'

class InventoryTransactionPacket extends DataPacket {
    static NetID = Identifiers.InventoryTransactionPacket

    legacyRequestId
    legacySetItemSlots = []

    transactionType
    hasNetworkIds

    actions = []

    decodePayload() {
        let length
        this.legacyRequestId = this.readVarInt()

        if (this.legacyRequestId !== 0) {
            length = this.readUnsignedVarInt()
            for (let i = 0; i < length; i++) {
                this.legacySetItemSlots.push(this.readLegacySetItemSlot())
            }
        }

        this.transactionType = this.readUnsignedVarInt()
        this.hasNetworkIds = this.readBool()

        length = this.readUnsignedVarInt()
        if (length > 512) {
            logger.warn(`Too many actions on InventoryTransactionPacket: ${length}`)
        }

        for (let i = 0; i < length; i++) {
            this.actions.push(this.readInventoryAction())
        }

        // TODO: not complete yet
    }
}
module.exports = InventoryTransactionPacket