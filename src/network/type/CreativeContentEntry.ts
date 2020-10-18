import type Item from '../../item';

class CreativeContentEntry {
    public entryId: number;
    public item: Item;

    public constructor(entryId: number, item: Item) {
        this.entryId = entryId;
        this.item = item;
    }
}

export default CreativeContentEntry;