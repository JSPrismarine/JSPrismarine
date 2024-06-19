import { NetworkUtil } from '../../network/NetworkUtil';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class ResourcePackResponsePacket extends DataPacket {
    public static NetID = Identifiers.ResourcePackResponsePacket;

    public status!: number;
    public packIds: string[] = [];

    public decodePayload(): void {
        this.status = this.readByte();
        let entryCount = this.readUnsignedShortLE();
        while (entryCount-- > 0) {
            this.packIds.push(NetworkUtil.readString(this));
        }
    }

    public encodePayload(): void {
        this.writeByte(this.status);
        this.writeUnsignedShortLE(0);

        this.writeUnsignedShortLE(this.packIds.length);
        this.packIds.forEach((id) => {
            NetworkUtil.writeString(this, id);
        });
    }
}
