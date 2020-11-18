import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class SetActorDataPacket extends DataPacket {
    static NetID = Identifiers.SetActorDataPacket;

    public runtimeEntityId!: bigint;
    public metadata: any;

    public tick!: bigint;

    public encodePayload() {
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.writeEntityMetadata(this.metadata);
        this.writeUnsignedVarLong(this.tick);
    }
}
