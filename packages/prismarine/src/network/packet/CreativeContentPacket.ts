import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';
import Item from '../../item/Item.js';

export default class CreativeContentPacket extends DataPacket {
    public static NetID = Identifiers.CreativeContentPacket;

    public items: Item[] = [];

    public encodePayload(): void {
        this.writeUnsignedVarInt(this.items.length);

        for (let i = 0; i < this.items.length; ++i) {
            this.writeUnsignedVarInt(i + 1); // network id
            this.items[i].networkSerialize(this);
        }
    }

    public decodePayload(): void {
        for (let i = 0; i < this.readUnsignedVarInt(); i++) {
            this.items.push(Item.networkDeserialize(this));
        }
    }
}
