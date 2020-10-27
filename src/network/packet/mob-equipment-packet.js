<<<<<<< HEAD
const DataPacket = require('./packet').default;
=======
const DataPacket = require('./Packet').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e
const Identifiers = require('../Identifiers').default;
const Item = require('../../item').default;


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
