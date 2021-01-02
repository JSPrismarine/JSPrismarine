import Player from '../player/Player';
import InventoryAction from './InventoryAction';
import SlotChangeInventoryAction from './SlotChangeInventoryAction';

export default class InventoryTransaction {
    private player: Player;
    private actions: InventoryAction[];

    constructor(player: Player, actions: InventoryAction[]) {
        this.player = player;
        this.actions = actions;
    }

    // Hack "borrowed" from https://github.com/pmmp/PocketMine-MP/blob/c368ebb5e74632bc622534b37cd1447b97281e20/src/pocketmine/inventory/transaction/InventoryTransaction.php#L173-L183
    private squashDuplicateSlotChanges() {
        this.actions.forEach((action) => {
            if (!(action instanceof SlotChangeInventoryAction)) return;
            // TODO: bunch of shit
        });
    }

    private validate() {
        this.squashDuplicateSlotChanges();
    }

    public async handle() {
        this.validate();

        // TODO: event(s)?

        this.actions.forEach((action) => {
            action.handle();
        });
    }
}
