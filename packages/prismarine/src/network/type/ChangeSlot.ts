// import BinaryStream from '@jsprismarine/jsbinaryutils';

class ChangeSlot {
    public containerId!: number;
    public changedSlots!: Buffer;

    public decode(buffer: any) {
        this.containerId = buffer.readByte();

        const count = buffer.readUnsignedVarInt();
        this.changedSlots = buffer.read(count);
        // TODO: move to packet binary stream
        return this;
    }

    public getContainerId() {
        return this.containerId;
    }

    public setContainerId(id: number) {
        this.containerId = id;
    }

    public getChangedSlots() {
        return this.changedSlots;
    }

    public setChangedSlots(changedSlots: Buffer) {
        this.changedSlots = changedSlots;
    }
}

export default ChangeSlot;
