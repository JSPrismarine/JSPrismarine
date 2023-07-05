import CreativeContentEntry from '../type/CreativeContentEntry.js';
import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';

export default class CreativeContentPacket extends DataPacket {
    public static NetID = Identifiers.CreativeContentPacket;

    public entries: any[] = [];

    public encodePayload() {
        this.writeUnsignedVarInt(0);
        /* Disabled for now cause it is not tested

        this.writeUnsignedVarInt(this.entries.length);

        this.entries.forEach((entry: CreativeContentEntry) => {
            entry.networkSerialize(this);
        });

         */
    }

    public decodePayload() {
        for (let i = 0; i < this.readUnsignedVarInt(); i++) {
            this.entries.push(CreativeContentEntry.networkDeserialize(this));
        }
    }
}
