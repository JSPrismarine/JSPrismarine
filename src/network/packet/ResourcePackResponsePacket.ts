import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class ResourcePackResponsePacket extends DataPacket {
    public static NetID = Identifiers.ResourcePackResponsePacket;

    public status!: number;
    public packIds: string[] = [];

    public decodePayload() {
        this.status = this.readByte();
        let entryCount = this.readLShort();
        while (entryCount-- > 0) {
            this.packIds.push(this.readString());
        }
    }

    public encodePayload() {
        this.writeByte(this.status);
        this.writeLShort(0);

        this.writeLShort(this.packIds.length);
        this.packIds.forEach((id) => {
            this.writeString(id);
        });
    }
}
