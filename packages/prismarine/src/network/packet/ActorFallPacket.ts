import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class ActorFallPacket extends DataPacket {
    public static NetID = Identifiers.ActorFallPacket;

    public runtimeEntityId!: bigint;
    public fallDistance!: number;
    public inVoid!: boolean;

    public decodePayload() {
        this.runtimeEntityId = this.readUnsignedVarLong();
        this.fallDistance = this.readFloatLE();
        this.inVoid = this.readBoolean();
    }

    public encodePayload() {
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.writeFloatLE(this.fallDistance);
        this.writeBoolean(this.inVoid);
    }
}
