import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class SetActorDataPacket extends DataPacket {
    static NetID = Identifiers.SetActorDataPacket;

    public runtimeEntityId!: bigint;
    public metadata: any;

    public encodePayload() {
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.writeEntityMetadata(this.metadata);
    }
}
