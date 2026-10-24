import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class PlayStatusPacket extends DataPacket {
    public static NetID = Identifiers.PlayStatusPacket;

    public override getId(): number {
        return PlayStatusPacket.NetID;
    }

    public override getName(): string {
        return 'PlayStatusPacket';
    }

    public status!: number;

    public encodePayload(): void {
        this.writeInt(this.status);
    }

    public decodePayload(): void {
        this.status = this.readInt();
    }
}
