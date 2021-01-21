import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class SetActorDataPacket extends DataPacket {
    public static NetID = Identifiers.SetActorDataPacket;

    public runtimeEntityId!: bigint;
    public metadata: Map<number, [number, string | number | bigint | boolean]> = new Map();

    public tick!: bigint;

    public encodePayload() {
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.writeEntityMetadata(this.metadata);
        this.writeUnsignedVarLong(this.tick);
    }
}
