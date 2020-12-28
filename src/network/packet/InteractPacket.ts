import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export enum InteractAction {
    LeaveVehicle = 3,
    MouseOver = 4,
    OpenNPC = 5,
    OpenInventory = 6
}

export default class InteractPacket extends DataPacket {
    static NetID = Identifiers.InteractPacket;

    public action!: number;
    public target!: bigint;

    public x!: number;
    public y!: number;
    public z!: number;

    public encodePayload() {
        this.writeByte(this.action);
        this.writeUnsignedVarLong(this.target);

        if (this.action === InteractAction.MouseOver) {
            this.writeLFloat(this.x);
            this.writeLFloat(this.y);
            this.writeLFloat(this.z);
        }
    }

    public decodePayload() {
        this.action = this.readByte();
        this.target = this.readUnsignedVarLong();

        if (this.action === InteractAction.MouseOver) {
            this.x = this.readLFloat();
            this.y = this.readLFloat();
            this.z = this.readLFloat();
        }
    }
}
