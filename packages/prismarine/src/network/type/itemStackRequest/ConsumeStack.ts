import type ItemStackRequestSlotInfo from './ItemStackRequestSlotInfo';

class ConsumeStack {
    public count: number;
    public from: ItemStackRequestSlotInfo;

    public constructor({ count, from }: { count: number; from: ItemStackRequestSlotInfo }) {
        this.count = count;
        this.from = from;
    }
}

export default ConsumeStack;
