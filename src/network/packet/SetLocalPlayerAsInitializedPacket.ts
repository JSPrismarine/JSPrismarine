import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class SetLocalPlayerAsInitializedPacket extends DataPacket {
    static NetID = Identifiers.SetLocalPlayerAsInitializedPacket;

    public runtimeEntityId!: bigint;

    public decodePayload() {
        this.runtimeEntityId = this.readUnsignedVarLong();
    }
}
