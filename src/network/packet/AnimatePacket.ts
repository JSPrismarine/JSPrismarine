import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class AnimatePacket extends DataPacket {
    static NetID = Identifiers.AnimatePacket;

    public action: number = 0;
    public runtimeEntityId: bigint = BigInt(0);
    public boatRowingTime: number = 0;

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
