const DataPacket = require('./packet');
const Identifiers = require('../identifiers');
const logger = require('../../utils/Logger');
const ChangeSlot = require('../type/change-slot');
const NetworkTransaction = require('../type/network-transaction');
const InventoryTransactionType = require('../type/inventory-transaction-type');
const Vector3 = require('../../math/vector3').default;


class InventoryTransactionPacket extends DataPacket {
    static NetID = Identifiers.InventoryTransactionPacket

    /** @type {number} */
    type
    actions = new Map()

    /** @type {number} */
    actionType = null
    /** @type {number} */
    hotbarSlot = null
    itemInHand = null

    /** @type {number|null} */
    blockX = null
    /** @type {number|null} */
    blockY = null
    /** @type {number|null} */
    blockZ = null
    /** @type {number} */
    face = null
    /** @type {Vector3} */
    playerPosition = null
    /** @type {Vector3} */
    clickPosition = null
    /** @type {number|null} */
    blockRuntimeId = null

    /** @type {number|null} */
    entityId = null

    // 1.16

    /** @type {number} */
    requestId
    changeSlot = new Map()
    /** @type {boolean} */
    hasItemtackIds

    decodePayload(server) {
        this.requestId = this.readVarInt();
        if (this.requestId != 0) {
            let length = this.readUnsignedVarInt();
            for (let i = 0; i < length; i++) {
                this.changeSlot.set(i, new ChangeSlot().decode(this));
            }
        }

        this.type = this.readUnsignedVarInt();
        this.hasItemtackIds = this.readBool();

        let actionsCount = this.readUnsignedVarInt();
        for (let i = 0; i < actionsCount; i++) {
            let networkTransaction = new NetworkTransaction(server).decode(this, this.hasItemtackIds);
            this.actions.set(i, networkTransaction);
        }

        switch(this.type) {
            case InventoryTransactionType.Normal:
            case InventoryTransactionType.Mismatch:
                break;
            case InventoryTransactionType.UseItem:
                this.actionType = this.readUnsignedVarInt();  
                this.blockX = this.readVarInt();
                this.blockY = this.readUnsignedVarInt();
                this.blockZ = this.readVarInt();
                this.face = this.readVarInt();
                this.hotbarSlot = this.readVarInt();
                this.itemInHand = this.readItemStack();
                this.playerPosition = new Vector3(this.readLFloat(), this.readLFloat(), this.readLFloat());
                this.clickPosition = new Vector3(this.readLFloat(), this.readLFloat(), this.readLFloat());
                this.blockRuntimeId = this.readUnsignedVarInt();
                break;
            case InventoryTransactionType.UseItemOnEntity:
                this.entityId = this.readUnsignedVarLong();
                this.actionType = this.readUnsignedVarInt();
                this.hotbarSlot = this.readVarInt();
                this.itemInHand = this.readItemStack();
                this.playerPosition = new Vector3(this.readLFloat(), this.readLFloat(), this.readLFloat());
                this.clickPosition = new Vector3(this.readLFloat(), this.readLFloat(), this.readLFloat());
                break;  
            case InventoryTransactionType.RelaseItem:
                this.actionType = this.readUnsignedVarInt();
                this.hotbarSlot = this.readVarInt();
                this.itemInHand = this.readItemStack();
                this.playerPosition = new Vector3(this.readLFloat(), this.readLFloat(), this.readLFloat());   
                break;
            default:
                server.getLogger().warn(`Unknown transaction type ${this.type}`);
        }
    }
}
module.exports = InventoryTransactionPacket;
