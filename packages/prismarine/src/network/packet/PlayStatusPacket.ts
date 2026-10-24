import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class PlayStatusPacket extends DataPacket {
    public static NetID = Identifiers.PlayStatusPacket;

    public status!: number;

    public encodePayload(): void {
        this.writeInt(this.status);
    }

    public decodePayload(): void {
        this.status = this.readInt();
    }
}
