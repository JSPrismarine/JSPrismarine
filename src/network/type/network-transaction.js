const NetworkTransactionSource = require('../type/network-transaction-source');
<<<<<<< HEAD
const PacketBinaryStream = require('../PacketBinaryStream');
=======
const PacketBinaryStream = require('../PacketBinaryStream').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e


class NetworkTransaction {
    #server;
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

    constructor(server) {
        this.#server = server;
    }

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
                this.#server.getLogger().warn(`Unknown source type ${this.sourceType}`);
        }

        this.slot = buffer.readUnsignedVarInt();
        this.oldItem = buffer.readItemStack();
        this.newItem = buffer.readItemStack();

        if (hasItemStack) {
            this.newItemStackId = buffer.readVarInt();
        }

        // TODO: move to packet binary stream
        return this;
    }
}
module.exports = NetworkTransaction;
