import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class RemoveActorPacket extends DataPacket {
    public static NetID = Identifiers.RemoveActorPacket;

    public uniqueEntityId!: bigint;

    public encodePayload() {
        this.writeVarLong(this.uniqueEntityId);
    }
}
