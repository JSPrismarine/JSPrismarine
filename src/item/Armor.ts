import Item, { ItemProps } from './Item';

export default class Armor extends Item {
    constructor(args: ItemProps) {
        super(args);
    }

    getMaxAmount() {
        return 1;
    }

    isArmorPiece() {
        return true;
    }
}
