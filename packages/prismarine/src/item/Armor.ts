import Item, { ItemProps } from './Item.js';

export default class Armor extends Item {
    public constructor(args: ItemProps) {
        super(args);
    }

    public getMaxAmount() {
        return 1;
    }

    public isArmorPiece() {
        return true;
    }
}
