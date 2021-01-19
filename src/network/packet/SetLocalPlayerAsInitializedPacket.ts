import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class SetLocalPlayerAsInitializedPacket extends DataPacket {
    public static NetID = Identifiers.SetLocalPlayerAsInitializedPacket;

    public runtimeEntityId!: bigint;

    public decodePayload() {
        this.runtimeEntityId = this.readUnsignedVarLong();
    }
}
