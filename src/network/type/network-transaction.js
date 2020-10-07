const NetworkTransactionSource = require('../type/network-transaction-source');
const logger = require('../../utils/logger');
const PacketBinaryStream = require('../packet-binary-stream');

'use strict';

class NetworkTransaction {

    /** @type {number} */
    sourceType
    /** @type {number} */
    windowId
    /** @type {number} */
    sourceFlags = 0
    /** @type {number} */
    slot

    oldItem
    newItem

    // 1.16
    newItemStackId

    /** @param {PacketBinaryStream} buffer */
    decode(buffer, hasItemStack = false) {
        this.sourceType = buffer.readUnsignedVarInt();

        switch(this.sourceType) {
            case NetworkTransactionSource.Container:
            case NetworkTransactionSource.Unknown:
            case NetworkTransactionSource.CraftingGrid:
                this.windowId = buffer.readVarInt();
                break;
            case NetworkTransactionSource.World:
                this.sourceFlags = buffer.readUnsignedVarInt(); 
                break;
            case NetworkTransactionSource.Creative:
                break;
            default:
                logger.warn(`Unknown source type ${this.sourceType}`);
        }

        this.slot = buffer.readUnsignedVarInt();
        this.oldItem = buffer.readItemStack();
        this.newItem = buffer.readItemStack();

        if (hasItemStack) {
            this.newItemStackId = buffer.readVarInt();
        }
    }
}
module.exports = NetworkTransaction;