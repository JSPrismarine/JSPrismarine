import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';

export default class SetLocalPlayerAsInitializedPacket extends DataPacket {
    public static NetID = Identifiers.SetLocalPlayerAsInitializedPacket;

    public runtimeEntityId!: bigint;

    public decodePayload() {
        this.runtimeEntityId = this.readUnsignedVarLong();
    }
}
