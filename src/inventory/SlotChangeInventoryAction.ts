import Player from '../player/Player';
import Inventory from './Inventory';
import InventoryAction, { InventoryActionItem } from './InventoryAction';

export default class SlotChangeInventoryAction extends InventoryAction {
    private inventory: Inventory;
    private slot: number;

    constructor(
        source: InventoryActionItem,
        target: InventoryActionItem,
        inventory: Inventory,
        slot: number
    ) {
        super(source, target);
        this.inventory = inventory;
        this.slot = slot;
    }
}
