import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import Item from '../../item/Item';

export default class CreativeContentPacket extends DataPacket {
    public static NetID = Identifiers.CreativeContentPacket;

    public items: Item[] = [];

    public encodePayload(): void {
        this.writeUnsignedVarInt(this.items.length);
        for (let i = 0; i < this.items.length; ++i) {
            this.writeUnsignedVarInt(i + 1); // network id
            this.items[i]!.networkSerialize(this);
        }
    }

    public decodePayload(): void {
        for (let i = 0; i < this.readUnsignedVarInt(); i++) {
            this.items.push(Item.networkDeserialize(this));
        }
    }
}
