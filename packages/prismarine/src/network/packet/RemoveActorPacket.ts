import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';

export default class RemoveActorPacket extends DataPacket {
    public static NetID = Identifiers.RemoveActorPacket;

    public uniqueEntityId!: bigint;

    public encodePayload() {
        this.writeVarLong(this.uniqueEntityId);
    }
}
