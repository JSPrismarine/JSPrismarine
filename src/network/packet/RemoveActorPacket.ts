import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class RemoveActorPacket extends DataPacket {
    static NetID = Identifiers.RemoveActorPacket;

    public uniqueEntityId: bigint = BigInt(0);

    public encodePayload() {
        this.writeVarLong(this.uniqueEntityId);
    }
}
