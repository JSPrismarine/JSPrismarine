import Player from '../player/Player';
import InventoryAction, { InventoryActionItem } from './InventoryAction';

export default class CreativeInventoryAction extends InventoryAction {
    private action: number;

    constructor(
        source: InventoryActionItem,
        target: InventoryActionItem,
        action: number
    ) {
        super(source, target);
        this.action = action;

        if (this.action !== 0 && this.action !== 1)
            throw new Error(`Invalid creative action slot ${this.action}`);
    }

    public isValid(player: Player): boolean {
        return player.gamemode === 1;
    }

    public getAction(): number {
        return this.action;
    }
}
