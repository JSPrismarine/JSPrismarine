const DataPacket = require('./packet');
const Identifiers = require('../identifiers');


class UpdateBlockPacket extends DataPacket {
    static NetID = Identifiers.UpdateBlockPacket

    /** @type {number} */
    x = 0.0
    /** @type {number} */
    y = 0.0
    /** @type {number} */
    z = 0.0
    /** @type {number} */
    BlockRuntimeId
    /** @type {number} */
    Flags = 2
    /** @type {number} */
    Layer = 1

    encodePayload() {
        this.writeLFloat(this.x);
        this.writeLFloat(this.y);
        this.writeLFloat(this.z);

        this.writeVarInt(this.BlockRuntimeId);

        this.writeVarInt(this.Flags);

        this.writeVarInt(this.Layer);
    }
}
module.exports = UpdateBlockPacket;
