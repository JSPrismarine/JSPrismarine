import ItemStackRequestSlotInfo from './ItemStackRequestSlotInfo';

class Drop {
    public count: number;
    public from: ItemStackRequestSlotInfo;
    public randomly: boolean;

    constructor({
        count,
        from,
        randomly
    }: {
        count: number;
        from: ItemStackRequestSlotInfo;
        randomly: boolean;
    }) {
        this.count = count;
        this.from = from;
        this.randomly = randomly;
    }
}

export default Drop;
