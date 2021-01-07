import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class CreativeContentPacket extends DataPacket {
    static NetID = Identifiers.CreativeContentPacket;

    public entries: any[] = [];

    public encodePayload() {
        this.writeUnsignedVarInt(this.entries.length);

        this.entries.forEach((entry) => {
            this.writeCreativeContentEntry(entry);
        });
    }

    public decodePayload() {
        for (let i = 0; i < this.readUnsignedVarInt(); i++) {
            this.entries.push(this.readCreativeContentEntry());
        }
    }
}
