import type BinaryStream from '@jsprismarine/jsbinaryutils';
import Item from '../../item/Item';

export default class CreativeItem {
    public networkId: number;
    public item: Item;

    public constructor(networkId: number, item: Item) {
        this.networkId = networkId;
        this.item = item;
    }

    public networkSerialize(stream: BinaryStream): void {
        stream.writeVarInt(this.networkId);
        this.item.networkSerialize(stream);
    }

    public static networkDeserialize(stream: BinaryStream): CreativeItem {
        const entryId = stream.readVarInt();
        const item = Item.networkDeserialize(stream);
        return new CreativeItem(entryId, item);
    }
}
