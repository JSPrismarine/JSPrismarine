const DataPacket = require('./packet');
const Identifiers = require('../identifiers');
const Item = require('../../inventory/item/item');

'use strict';

class MobEquipmentPacket extends DataPacket {
    static NetID = Identifiers.MobEquipmentPacket

    /** @type {number} */
    runtimeEntityId
    /** @type {Item} */
    item
    /** @type {number} */
    inventorySlot
    /** @type {number} */
    hotbarSlot
    /** @type {number} */
    windowId

    encodePayload() {
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.writeItemStack(this.item);
        this.writeByte(this.inventorySlot);
        this.writeByte(this.hotbarSlot);
        this.writeByte(this.windowId);
    }
}
module.exports = MobEquipmentPacket;