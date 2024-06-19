import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export enum InteractAction {
    LeaveVehicle = 3,
    MouseOver = 4,
    OpenNPC = 5,
    OpenInventory = 6
}

export default class InteractPacket extends DataPacket {
    public static NetID = Identifiers.InteractPacket;

    public action!: number;
    public target!: bigint;

    public x!: number;
    public y!: number;
    public z!: number;

    public encodePayload(): void {
        this.writeByte(this.action);
        this.writeUnsignedVarLong(this.target);

        if (this.action === InteractAction.MouseOver) {
            this.writeFloatLE(this.x);
            this.writeFloatLE(this.y);
            this.writeFloatLE(this.z);
        }
    }

    public decodePayload(): void {
        this.action = this.readByte();
        this.target = this.readUnsignedVarLong();

        if (this.action === InteractAction.MouseOver) {
            this.x = this.readFloatLE();
            this.y = this.readFloatLE();
            this.z = this.readFloatLE();
        }
    }
}
