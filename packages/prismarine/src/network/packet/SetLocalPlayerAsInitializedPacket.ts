import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class SetLocalPlayerAsInitializedPacket extends DataPacket {
    public static NetID = Identifiers.SetLocalPlayerAsInitializedPacket;

    public override getId(): number {
        return SetLocalPlayerAsInitializedPacket.NetID;
    }

    public override getName(): string {
        return 'SetLocalPlayerAsInitializedPacket';
    }

    public runtimeEntityId!: bigint;

    public decodePayload(): void {
        this.runtimeEntityId = this.readUnsignedVarLong();
    }
}
