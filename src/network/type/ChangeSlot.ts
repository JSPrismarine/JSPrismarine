import type PacketBinaryStream from '../PacketBinaryStream';

class ChangeSlot {
    public containerId!: number;
    public changedSlots!: number[];

    public decode(buffer: PacketBinaryStream): this {
        this.containerId = buffer.readByte();

        let count = buffer.readUnsignedVarInt();
        this.changedSlots = [...buffer.read(count)]; // this is needed to properly concat to a number[]
        // TODO: move to packet binary stream
        return this;
    }

    public getContainerId(): number {
        return this.containerId;
    }

    public setContainerId(id: number): void {
        this.containerId = id;
    }

    public getChangedSlots(): number[] {
        return this.changedSlots;
    }

    public setChangedSlots(changedSlots: number[]): void {
        this.changedSlots = changedSlots;
    }

}
export default ChangeSlot;
