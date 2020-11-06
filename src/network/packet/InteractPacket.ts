import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export enum InteractAction {
    LeaveVehicle = 3,
    MouseOver = 4,
    OpenNPC = 5,
    OpenInventory = 6
}

export default class InteractPacket extends DataPacket {
    static NetID = Identifiers.InteractPacket;

    public action: number = 0;
    public target: bigint = BigInt(0);

    public x: number | null = null;
    public y: number | null = null;
    public z: number | null = null;

    public decodePayload() {
        this.action = this.readByte();
        this.target = this.readUnsignedVarLong();

        if (this.action == InteractAction.MouseOver) {
            this.x = this.readLFloat();
            this.y = this.readLFloat();
            this.z = this.readLFloat();
        }
    }
}
