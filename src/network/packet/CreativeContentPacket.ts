import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class CreativeContentPacket extends DataPacket {
    static NetID = Identifiers.CreativeContentPacket;

    public entries: any[] = [];

    public encodePayload() {
        this.writeUnsignedVarInt(this.entries.length);

        for (let i = 0; i < this.entries.length; i++) {
            this.writeCreativeContentEntry(this.entries[i]);
        }
    }

    public decodePayload() {
        for (let i = 0; i < this.readUnsignedVarInt(); i++) {
            this.entries.push(this.readCreativeContentEntry());
        }
    }
}
