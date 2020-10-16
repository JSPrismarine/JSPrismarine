import Item from "../item";
import Prismarine from "../Prismarine";
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
