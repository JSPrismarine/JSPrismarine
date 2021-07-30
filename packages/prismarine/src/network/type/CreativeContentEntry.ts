import BinaryStream from '@jsprismarine/jsbinaryutils';
import Block from '../../block/Block';
import ContainerEntry from '../../inventory/ContainerEntry';
import Item from '../../item/Item';
import PacketBinaryStream from '../PacketBinaryStream';

class CreativeContentEntry {
    public entryId: number;
    public item: Item | Block;

    public constructor(entryId: number, item: Item | Block) {
        this.entryId = entryId;
        this.item = item;
    }

    public networkSerialize(stream: BinaryStream): void {
        stream.writeUnsignedVarInt(this.entryId);
        new ContainerEntry({ item: this.item, count: 1 }).networkSerialize(stream);
    }

    public static networkDeserialize(stream: PacketBinaryStream): CreativeContentEntry {
        const entryId = stream.readUnsignedVarInt();
        const item = Item.networkDeserialize(stream);
        return new CreativeContentEntry(entryId, item);
    }
}

export default CreativeContentEntry;
