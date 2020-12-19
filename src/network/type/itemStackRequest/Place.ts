import ItemStackRequestSlotInfo from './ItemStackRequestSlotInfo';

class Place {
    public count: number;
    public from: ItemStackRequestSlotInfo;
    public to: ItemStackRequestSlotInfo;

    constructor({
        count,
        from,
        to
    }: {
        count: number;
        from: ItemStackRequestSlotInfo;
        to: ItemStackRequestSlotInfo;
    }) {
        this.count = count;
        this.from = from;
        this.to = to;
    }
}

export default Place;
