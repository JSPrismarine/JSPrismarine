import TieredTool from "../TieredTool";
import { BlockToolType } from "../../block/BlockToolType";
import { ItemIdsType } from "../ItemIdsType";
import { ItemTieredToolType } from "../ItemTieredToolType";

export default class Axe extends TieredTool {
    constructor() {
        super(
            {
                name: "minecraft:stone_axe",
                id: ItemIdsType.StoneAxe,
            },
            ItemTieredToolType.Stone
        );
    }

    getMaxDurability() {
        return 132;
    }

    getToolType() {
        return BlockToolType.Axe;
    }
}
