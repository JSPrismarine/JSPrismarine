import Item from "../item";
import Prismarine from "../prismarine";
import Block from "./";

export default class Liquid extends Block {
    getHardness() {
        return 100;
    }

    getDropsForCompatibleTool(item: Item, server: Prismarine) {
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
};
