import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class RemoveActorPacket extends DataPacket {
    public static NetID = Identifiers.RemoveActorPacket;

    public uniqueEntityId!: bigint;

    public encodePayload(): void {
        this.writeVarLong(this.uniqueEntityId);
    }
}
