import type { ItemProps } from './Item';
import { Item } from './Item';

export default class Tool extends Item {
    public constructor(args: ItemProps) {
        super(args);
    }

    public getMaxAmount() {
        return 1;
    }

    public isTool() {
        return true;
    }
}
