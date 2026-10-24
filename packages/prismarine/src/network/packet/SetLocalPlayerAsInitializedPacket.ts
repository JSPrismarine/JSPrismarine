import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class SetLocalPlayerAsInitializedPacket extends DataPacket {
    public static NetID = Identifiers.SetLocalPlayerAsInitializedPacket;

    public runtimeEntityId!: bigint;

    public decodePayload(): void {
        this.runtimeEntityId = this.readUnsignedVarLong();
    }
}
