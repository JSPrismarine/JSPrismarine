import Inventory from './Inventory';
import InventoryAction from './InventoryAction';
import Player from '../player/Player';
import ContainerEntry from './ContainerEntry';

export default class SlotChangeInventoryAction extends InventoryAction {
    private inventory: Inventory;
    private slot: number;

    constructor(
        source: ContainerEntry,
        target: ContainerEntry,
        inventory: Inventory,
        slot: number
    ) {
        super(source, target);
        this.inventory = inventory;
        this.slot = slot;
    }

    public isValid(player: Player): boolean {
        return true; // TODO: actually validates
    }

    public handle() {
        this.inventory.setItem(this.slot, this.getTarget());
    }
}
