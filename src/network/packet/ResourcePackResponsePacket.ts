import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class ResourcePackResponsePacket extends DataPacket {
    static NetID = Identifiers.ResourcePackResponsePacket;

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

        //this.writeLShort(this.packIds.length);
        //for (let i = 0; i < this.packIds.length; i++)
        //    this.writeString(this.packIds[i]);
    }
}
