import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class AnimatePacket extends DataPacket {
    public static NetID = Identifiers.AnimatePacket;

    public action!: number;
    public runtimeEntityId!: bigint;
    public boatRowingTime!: number;

    public encodePayload(): void {
        this.writeVarInt(this.action);
        this.writeUnsignedVarLong(this.runtimeEntityId);
        if ((this.action & 0x80) !== 0) {
            this.writeFloatLE(this.boatRowingTime);
        }
    }

    public decodePayload(): void {
        this.action = this.readVarInt();
        this.runtimeEntityId = this.readUnsignedVarLong();
        if ((this.action & 0x80) !== 0) {
            this.boatRowingTime = this.readFloatLE();
        }
    }
}
