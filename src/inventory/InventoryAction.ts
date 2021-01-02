import Player from '../player/Player';

export interface InventoryActionItem {
    id: number;
    meta: number;
}

export default class InventoryAction {
    private source: InventoryActionItem;
    private target: InventoryActionItem;

    constructor(source: InventoryActionItem, target: InventoryActionItem) {
        this.source = source;
        this.target = target;
    }

    public getSource(): InventoryActionItem {
        return this.source;
    }

    public getTarget(): InventoryActionItem {
        return this.target;
    }

    public isValid(player: Player): boolean {
        return false;
    }

    public handle() {}
}
