import Block from './Block.js';
import Item from '../item/Item.js';
import Server from '../Server.js';

/**
 * Liquid blocks (eg. Water, Still Water, Lava, Still Lava)
 */
export default class Liquid extends Block {
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
