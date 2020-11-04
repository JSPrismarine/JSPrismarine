import Item, { ItemProps } from ".";

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
