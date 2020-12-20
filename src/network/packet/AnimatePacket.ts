import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class AnimatePacket extends DataPacket {
    static NetID = Identifiers.AnimatePacket;

    public action!: number;
    public runtimeEntityId!: bigint;
    public boatRowingTime!: number;

    encodePayload() {
        this.writeVarInt(this.action);
        this.writeUnsignedVarLong(this.runtimeEntityId);
        if ((this.action & 0x80) !== 0) {
            this.writeLFloat(this.boatRowingTime);
        }
    }

    decodePayload() {
        this.action = this.readVarInt();
        this.runtimeEntityId = this.readUnsignedVarLong();
        if ((this.action & 0x80) !== 0) {
            this.boatRowingTime = this.readLFloat();
        }
    }
}
