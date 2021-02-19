import type ItemStackRequestSlotInfo from './ItemStackRequestSlotInfo';

class Drop {
    public count: number;
    public from: ItemStackRequestSlotInfo;
    public randomly: boolean;

    public constructor({
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
