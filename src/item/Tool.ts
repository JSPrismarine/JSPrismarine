import Item, { ItemProps } from './Item';

export default class Tool extends Item {
    public constructor(args: ItemProps) {
        super(args);
    }

    getMaxAmount() {
        return 1;
    }

    isTool() {
        return true;
    }
}
