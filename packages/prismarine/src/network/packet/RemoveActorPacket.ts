import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class RemoveActorPacket extends DataPacket {
    public static NetID = Identifiers.RemoveActorPacket;

    public override getId(): number {
        return RemoveActorPacket.NetID;
    }

    public override getName(): string {
        return 'RemoveActorPacket';
    }

    public uniqueEntityId!: bigint;

    public encodePayload(): void {
        this.writeVarLong(this.uniqueEntityId);
    }
}
