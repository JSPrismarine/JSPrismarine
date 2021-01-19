import Block from './Block';
import Item from '../item/Item';
import Server from '../Server';

/**
 * Liquid blocks (eg. Water, Still Water, Lava, Still Lava)
 */
export default class Liquid extends Block {
    public getHardness() {
        return 100;
    }

    public getDropsForCompatibleTool(item: Item, server: Server) {
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
