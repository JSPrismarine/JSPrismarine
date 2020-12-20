import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class ActorFallPacket extends DataPacket {
    static NetID = Identifiers.ActorFallPacket;

    public runtimeEntityId!: bigint;
    public fallDistance!: number;
    public inVoid!: boolean;

    public decodePayload() {
        this.runtimeEntityId = this.readUnsignedVarLong();
        this.fallDistance = this.readLFloat();
        this.inVoid = this.readBool();
    }

    public encodePayload() {
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.writeLFloat(this.fallDistance);
        this.writeBool(this.inVoid);
    }
}
