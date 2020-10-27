<<<<<<< HEAD
const DataPacket = require('./packet').default;
=======
const DataPacket = require('./Packet').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e
const Identifiers = require('../Identifiers').default;
const Item = require('../../item').default;


class InventoryContentPacket extends DataPacket {
    static NetID = Identifiers.InventoryContentPacket

    /** @type {number} */
    windowId
    /** @type {Item[]} */
    items

    encodePayload() {
        this.writeUnsignedVarInt(this.windowId);

        // Write item stacks
        this.writeUnsignedVarInt(this.items.length);
        for (let i = 0; i < this.items.length; i++) {
            this.writeItemStack(this.items[i]);
        }
    }
}
module.exports = InventoryContentPacket;
