const PacketBinaryStream = require('../packet-binary-stream');


class ChangeSlot {

    /** @type {number} */
    containerId
    /** @type {number[]} */
    changedSlots

    /** @param {PacketBinaryStream} buffer */
    decode(buffer) {
        this.containerId = buffer.readByte();

        let count = buffer.readUnsignedVarInt();
        this.changedSlots = buffer.read(count);
        // TODO: move to packet binary stream
        return this;
    }

    getContainerId() {
        return this.containerId;
    }

    setContainerId(id) {
        this.containerId = id;
    }

    getChangedSlots() {
        return this.changedSlots;
    }

    setChangedSlots(changedSlots) {
        this.changedSlots = changedSlots;
    }

}
module.exports = ChangeSlot;
