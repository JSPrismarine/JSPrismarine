import { Block } from './Block';
import type Item from '../item/Item';
import type Server from '../Server';

/**
 * Liquid blocks (eg. Water, Still Water, Lava, Still Lava)
 */
export class Liquid extends Block {
    public getHardness() {
        return 100;
    }

    public getDropsForCompatibleTool(_item: Item, _server: Server) {
        return [];
    }

    public canBeFlowedInto() {
        return true;
    }

    public isBreakable() {
        return false;
    }

    public isSolid() {
        return false;
    }

    public isPartOfCreativeInventory() {
        return false;
    }
}
