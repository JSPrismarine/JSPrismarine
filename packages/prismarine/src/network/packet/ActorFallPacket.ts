import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class ActorFallPacket extends DataPacket {
    public static NetID = Identifiers.ActorFallPacket;

    public runtimeEntityId!: bigint;
    public fallDistance!: number;
    public inVoid!: boolean;

    public decodePayload(): void {
        this.runtimeEntityId = this.readUnsignedVarLong();
        this.fallDistance = this.readFloatLE();
        this.inVoid = this.readBoolean();
    }

    public encodePayload(): void {
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.writeFloatLE(this.fallDistance);
        this.writeBoolean(this.inVoid);
    }
}
