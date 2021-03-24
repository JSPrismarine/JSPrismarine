import CreativeContentEntry from '../type/CreativeContentEntry';
import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import { stream } from 'winston';

export default class CreativeContentPacket extends DataPacket {
    public static NetID = Identifiers.CreativeContentPacket;

    public entries: any[] = [];

    public encodePayload() {
        this.writeUnsignedVarInt(this.entries.length);

        this.entries.forEach((entry: CreativeContentEntry) => {
            entry.networkSerialize(this);
        });
    }

    public decodePayload() {
        for (let i = 0; i < this.readUnsignedVarInt(); i++) {
            this.entries.push(CreativeContentEntry.networkDeserialize(this));
        }
    }
}
