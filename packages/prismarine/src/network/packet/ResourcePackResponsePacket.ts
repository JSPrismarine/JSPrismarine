import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';
import McpeUtil from '../NetworkUtil.js';

export default class ResourcePackResponsePacket extends DataPacket {
    public static NetID = Identifiers.ResourcePackResponsePacket;

    public status!: number;
    public packIds: string[] = [];

    public decodePayload() {
        this.status = this.readByte();
        let entryCount = this.readUnsignedShortLE();
        while (entryCount-- > 0) {
            this.packIds.push(McpeUtil.readString(this));
        }
    }

    public encodePayload() {
        this.writeByte(this.status);
        this.writeUnsignedShortLE(0);

        this.writeUnsignedShortLE(this.packIds.length);
        this.packIds.forEach((id) => {
            McpeUtil.writeString(this, id);
        });
    }
}
