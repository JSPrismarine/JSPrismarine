import PacketBinaryStream from '../PacketBinaryStream';

class ChangeSlot {
    public containerId!: number;
    public changedSlots!: Buffer;

    decode(buffer: PacketBinaryStream) {
        this.containerId = buffer.readByte();

        const count = buffer.readUnsignedVarInt();
        this.changedSlots = buffer.read(count);
        // TODO: move to packet binary stream
        return this;
    }

    getContainerId() {
        return this.containerId;
    }

    setContainerId(id: number) {
        this.containerId = id;
    }

    getChangedSlots() {
        return this.changedSlots;
    }

    setChangedSlots(changedSlots: Buffer) {
        this.changedSlots = changedSlots;
    }
}

export default ChangeSlot;
