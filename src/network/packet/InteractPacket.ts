import Identifiers from '../Identifiers';
import DataPacket from './Packet';

export enum InteractAction {
    LeaveVehicle = 3,
    MouseOver = 4,
    OpenNPC = 5,
    OpenInventory = 6
}

export default class InteractPacket extends DataPacket {
    static NetID = Identifiers.InteractPacket;

    action: number = 0;
    target: bigint = BigInt(0);

    x: number | null = null;
    y: number | null = null;
    z: number | null = null;

    decodePayload() {
        this.action = this.readByte();
        this.target = this.readUnsignedVarLong();

        if (this.action == InteractAction.MouseOver) {
            this.x = this.readLFloat();
            this.y = this.readLFloat();
            this.z = this.readLFloat();
        }
    }
}
