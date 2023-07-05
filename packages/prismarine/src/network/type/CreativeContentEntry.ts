// import BinaryStream from '@jsprismarine/jsbinaryutils';
import Block from '../../block/Block.js';
import ContainerEntry from '../../inventory/ContainerEntry.js';
import Item from '../../item/Item.js';

class CreativeContentEntry {
    public entryId: number;
    public item: Item | Block;

    public constructor(entryId: number, item: Item | Block) {
        this.entryId = entryId;
        this.item = item;
    }

    public networkSerialize(stream: any): void {
        stream.writeVarInt(this.entryId);
        new ContainerEntry({ item: this.item, count: 1 }).networkSerialize(stream);
    }

    public static networkDeserialize(stream: any): CreativeContentEntry {
        const entryId = stream.readVarInt();
        const item = Item.networkDeserialize(stream);
        return new CreativeContentEntry(entryId, item);
    }
}

export default CreativeContentEntry;
