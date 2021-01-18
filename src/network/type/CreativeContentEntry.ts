import Block from '../../block/Block';
import Item from '../../item/Item';

class CreativeContentEntry {
    public entryId: number;
    public item: Item | Block;

    public constructor(entryId: number, item: Item | Block) {
        this.entryId = entryId;
        this.item = item;
    }
}

export default CreativeContentEntry;
