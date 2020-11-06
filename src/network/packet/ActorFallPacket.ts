import Identifiers from '../Identifiers';
import DataPacket from './Packet';

export default class ActorFallPacket extends DataPacket {
    static NetID = Identifiers.ActorFallPacket;

    public runtimeEntityId: bigint = BigInt(0);
    public fallDistance: number = 0;
    public inVoid: boolean = false;

    public decodePayload() {
        this.runtimeEntityId = this.readUnsignedVarLong();
        this.fallDistance = this.readLFloat();
        this.inVoid = this.readBool();
    }

    public encodePayload() {
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.writeLFloat(this.fallDistance);
        this.writeBool(+this.inVoid);
    }
}
