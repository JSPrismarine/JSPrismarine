const DataPacket = require('./packet');
const Identifiers = require('../identifiers');
const logger = require('../../utils/logger');
const ChangeSlot = require('../type/change-slot');
const NetworkTransaction = require('../type/network-transaction');
const InventoryTransactionType = require('../type/inventory-transaction-type');
const Vector3 = require('../../math/vector3');


class InventoryTransactionPacket extends DataPacket {
    static NetID = Identifiers.InventoryTransactionPacket

    /** @type {number} */
    type
    /** @type {Set<NetworkTransaction>} */
    actions = new Set()

    /** @type {number} */
    actionType
    /** @type {number} */
    hotbarSlot
    itemInHand

    /** @type {number|null} */
    blockX = null
    /** @type {number|null} */
    blockY = null
    /** @type {number|null} */
    blockZ = null
    /** @type {number} */
    face = null
    /** @type {Vector3} */
    playerPosition
    /** @type {Vector3} */
    clickPosition
    /** @type {number|null} */
    blockRuntimeId = null

    /** @type {number|null} */
    entityId = null

    // 1.16

    /** @type {number} */
    requestId
    /** @type {Set<ChangeSlot>} */
    changeSlot = new Set()
    /** @type {boolean} */
    hasItemtackIds

    decodePayload() {
        this.requestId = this.readVarInt();
        if (this.requestId != 0) {
            let length = this.readUnsignedVarInt();
            for (let i = 0; i < length; i++) {
                let changeSlot = new ChangeSlot().decode(this);
                this.changeSlot.add(changeSlot);
            }
        }

        this.type = this.readUnsignedVarInt();
        this.hasItemtackIds = this.readBool();

        let actionsCount = this.readUnsignedVarInt();
        for (let i = 0; i < actionsCount; i++) {
            let networkTransaction = new NetworkTransaction().decode(this, this.hasItemtackIds);
            this.actions.add(networkTransaction);
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
                logger.warn(`Unknown transaction type ${this.type}`);
        }
    }
}
module.exports = InventoryTransactionPacket;
