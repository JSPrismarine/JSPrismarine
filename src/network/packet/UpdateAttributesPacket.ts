import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class UpdateAttributesPacket extends DataPacket {
    static NetID = Identifiers.UpdateAttributesPacket;

    public runtimeEntityId!: bigint;
    public attributes = [];

    public tick!: bigint;

    public encodePayload() {
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.writeAttributes(this.attributes);
        this.writeUnsignedVarLong(this.tick);
    }
}
