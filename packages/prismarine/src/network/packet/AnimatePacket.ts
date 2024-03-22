import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class AnimatePacket extends DataPacket {
    public static NetID = Identifiers.AnimatePacket;

    public action!: number;
    public runtimeEntityId!: bigint;
    public boatRowingTime!: number;

    public encodePayload() {
        this.writeVarInt(this.action);
        this.writeUnsignedVarLong(this.runtimeEntityId);
        if ((this.action & 0x80) !== 0) {
            this.writeFloatLE(this.boatRowingTime);
        }
    }

    public decodePayload() {
        this.action = this.readVarInt();
        this.runtimeEntityId = this.readUnsignedVarLong();
        if ((this.action & 0x80) !== 0) {
            this.boatRowingTime = this.readFloatLE();
        }
    }
}
