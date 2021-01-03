import Item from '../item/Item';
import Server from '../Server';
import Block from './Block';

/**
 * Liquid blocks (eg. Water, Still Water, Lava, Still Lava)
 */
export default class Liquid extends Block {
    getHardness() {
        return 100;
    }

    getDropsForCompatibleTool(item: Item, server: Server) {
        return [];
    }

    canBeFlowedInto() {
        return true;
    }

    isBreakable() {
        return false;
    }

    isSolid() {
        return false;
    }

    isPartOfCreativeInventory() {
        return false;
    }
}
